"""Tests for POST /auth/change-password and POST /auth/refresh."""
from __future__ import annotations

import pytest
from app.core.security import hash_password, create_access_token, verify_password
from app.models.user import User


def _make_user(db, email="user@test.local", password="oldpass123", role="admin"):
    u = User(
        email=email,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
        failed_login_count=0,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _token(user):
    return create_access_token(subject=user.email, role=user.role, user_id=user.id)


class TestChangePassword:
    def test_success(self, client, db_session):
        user = _make_user(db_session)
        resp = client.post(
            "/auth/change-password",
            json={"current_password": "oldpass123", "new_password": "newpass456"},
            headers={"Authorization": f"Bearer {_token(user)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        db_session.refresh(user)
        assert verify_password("newpass456", user.password_hash)

    def test_wrong_current_password(self, client, db_session):
        user = _make_user(db_session)
        resp = client.post(
            "/auth/change-password",
            json={"current_password": "WRONG", "new_password": "newpass456"},
            headers={"Authorization": f"Bearer {_token(user)}"},
        )
        assert resp.status_code == 400

    def test_new_password_too_short(self, client, db_session):
        user = _make_user(db_session)
        resp = client.post(
            "/auth/change-password",
            json={"current_password": "oldpass123", "new_password": "short"},
            headers={"Authorization": f"Bearer {_token(user)}"},
        )
        assert resp.status_code == 400

    def test_unauthenticated(self, client, db_session):
        resp = client.post(
            "/auth/change-password",
            json={"current_password": "x", "new_password": "newpass456"},
        )
        assert resp.status_code == 401

    def test_resets_lockout_on_success(self, client, db_session):
        user = _make_user(db_session)
        user.failed_login_count = 7
        db_session.commit()
        client.post(
            "/auth/change-password",
            json={"current_password": "oldpass123", "new_password": "newpass456"},
            headers={"Authorization": f"Bearer {_token(user)}"},
        )
        db_session.refresh(user)
        assert user.failed_login_count == 0


class TestRefresh:
    def test_refresh_returns_new_token(self, client, db_session):
        user = _make_user(db_session)
        original = _token(user)
        resp = client.post("/auth/refresh", headers={"Authorization": f"Bearer {original}"})
        assert resp.status_code == 200
        new_token = resp.json()["access_token"]
        assert new_token  # non-empty
        # New token should authenticate
        me = client.get("/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert me.status_code == 200
        assert me.json()["email"] == user.email

    def test_refresh_unauthenticated(self, client):
        resp = client.post("/auth/refresh")
        assert resp.status_code == 401
