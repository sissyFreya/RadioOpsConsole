"""Tests for role-based access control across key endpoints."""
from __future__ import annotations

import pytest
from app.core.security import hash_password, create_access_token
from app.models.user import User
from app.models.node import Node


def _make_token(db, role: str) -> str:
    email = f"{role}@test.local"
    u = User(email=email, password_hash=hash_password("x"), role=role, is_active=True, failed_login_count=0)
    db.add(u)
    db.commit()
    return create_access_token(subject=email, role=role)


def _make_node(db, name="n1", url="http://agent:9000") -> Node:
    node = Node(name=name, agent_url=url)
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


class TestNodesRBAC:
    def test_viewer_can_list_nodes(self, client, db_session):
        token = _make_token(db_session, "viewer")
        resp = client.get("/nodes/", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_viewer_cannot_create_node(self, client, db_session):
        token = _make_token(db_session, "viewer")
        resp = client.post("/nodes/", json={"name": "x", "agent_url": "http://x:9000"},
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_ops_can_create_node(self, client, db_session):
        token = _make_token(db_session, "ops")
        resp = client.post("/nodes/", json={"name": "new-node", "agent_url": "http://x:9000"},
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_admin_can_delete_node(self, client, db_session):
        token = _make_token(db_session, "admin")
        node = _make_node(db_session, name="del-me")
        resp = client.delete(f"/nodes/{node.id}", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 204)

    def test_viewer_cannot_delete_node(self, client, db_session):
        token = _make_token(db_session, "viewer")
        node = _make_node(db_session, name="protected")
        resp = client.delete(f"/nodes/{node.id}", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_unauthenticated_cannot_list_nodes(self, client):
        resp = client.get("/nodes/")
        assert resp.status_code == 401


class TestUsersRBAC:
    def test_admin_can_list_users(self, client, db_session):
        token = _make_token(db_session, "admin")
        resp = client.get("/users/", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_ops_cannot_list_users(self, client, db_session):
        token = _make_token(db_session, "ops")
        resp = client.get("/users/", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_viewer_cannot_list_users(self, client, db_session):
        token = _make_token(db_session, "viewer")
        resp = client.get("/users/", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403


class TestActionsRBAC:
    def test_viewer_cannot_trigger_action(self, client, db_session):
        token = _make_token(db_session, "viewer")
        node = _make_node(db_session)
        resp = client.post("/actions/", json={"node_id": node.id, "service": "icecast", "action": "restart"},
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    def test_viewer_can_list_actions(self, client, db_session):
        token = _make_token(db_session, "viewer")
        resp = client.get("/actions/", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
