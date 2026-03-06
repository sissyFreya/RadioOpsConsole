"""Tests for nodes CRUD endpoints."""
from __future__ import annotations

import pytest
from app.models.node import Node


class TestNodesCRUD:
    def test_list_empty(self, client, admin_token):
        resp = client.get("/nodes/", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_and_list(self, client, admin_token):
        resp = client.post("/nodes/", json={"name": "node1", "agent_url": "http://agent:9000"},
                           headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "node1"
        assert data["agent_url"] == "http://agent:9000"
        assert "id" in data

        listed = client.get("/nodes/", headers={"Authorization": f"Bearer {admin_token}"}).json()
        assert len(listed) == 1

    def test_get_by_id(self, client, admin_token, db_session):
        node = Node(name="n1", agent_url="http://x:9000")
        db_session.add(node)
        db_session.commit()
        db_session.refresh(node)

        resp = client.get(f"/nodes/{node.id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "n1"

    def test_get_nonexistent_returns_404(self, client, admin_token):
        resp = client.get("/nodes/9999", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 404

    def test_update_node(self, client, admin_token, db_session):
        node = Node(name="old-name", agent_url="http://x:9000")
        db_session.add(node)
        db_session.commit()
        db_session.refresh(node)

        resp = client.put(f"/nodes/{node.id}", json={"name": "new-name", "agent_url": "http://x:9000"},
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "new-name"

    def test_delete_node(self, client, admin_token, db_session):
        node = Node(name="to-delete", agent_url="http://x:9000")
        db_session.add(node)
        db_session.commit()
        db_session.refresh(node)

        resp = client.delete(f"/nodes/{node.id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code in (200, 204)

        resp2 = client.get(f"/nodes/{node.id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp2.status_code == 404

    def test_delete_nonexistent_returns_404(self, client, admin_token):
        resp = client.delete("/nodes/9999", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 404
