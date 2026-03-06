"""Tests for authentication endpoints."""
from __future__ import annotations

import pytest
from app.core.security import hash_password
from app.models.user import User


def _create_user(db, email="user@test.local", password="secret", role="admin", is_active=True):
    u = User(
        email=email,
        password_hash=hash_password(password),
        role=role,
        is_active=is_active,
        failed_login_count=0,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


class TestLogin:
    def test_login_success(self, client, db_session):
        _create_user(db_session, email="a@b.com", password="pass123")
        resp = client.post("/auth/login", json={"email": "a@b.com", "password": "pass123"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client, db_session):
        _create_user(db_session, email="a@b.com", password="correct")
        resp = client.post("/auth/login", json={"email": "a@b.com", "password": "wrong"})
        assert resp.status_code == 401

    def test_login_unknown_email(self, client, db_session):
        resp = client.post("/auth/login", json={"email": "nobody@b.com", "password": "x"})
        assert resp.status_code == 401

    def test_login_inactive_user(self, client, db_session):
        _create_user(db_session, email="a@b.com", password="pass", is_active=False)
        resp = client.post("/auth/login", json={"email": "a@b.com", "password": "pass"})
        assert resp.status_code == 401

    def test_lockout_after_8_failures(self, client, db_session):
        _create_user(db_session, email="locked@b.com", password="correct")
        for _ in range(8):
            client.post("/auth/login", json={"email": "locked@b.com", "password": "wrong"})
        # 9th attempt — account should now be locked
        resp = client.post("/auth/login", json={"email": "locked@b.com", "password": "wrong"})
        assert resp.status_code in (401, 403)

    def test_login_returns_different_tokens_for_different_users(self, client, db_session):
        _create_user(db_session, email="user1@b.com", password="p1")
        _create_user(db_session, email="user2@b.com", password="p2")
        t1 = client.post("/auth/login", json={"email": "user1@b.com", "password": "p1"}).json()["access_token"]
        t2 = client.post("/auth/login", json={"email": "user2@b.com", "password": "p2"}).json()["access_token"]
        assert t1 != t2


class TestMe:
    def test_me_authenticated(self, client, admin_token):
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "admin@test.local"
        assert data["role"] == "admin"

    def test_me_unauthenticated(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_invalid_token(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
        assert resp.status_code == 401
