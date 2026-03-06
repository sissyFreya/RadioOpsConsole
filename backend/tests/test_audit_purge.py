"""Tests for DELETE /audit/purge."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from app.core.security import create_access_token, hash_password
from app.models.audit import AuditEvent
from app.models.user import User


def _make_admin(db):
    u = User(
        email="admin@test.local",
        password_hash=hash_password("pass"),
        role="admin",
        is_active=True,
        failed_login_count=0,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_ops(db):
    u = User(
        email="ops@test.local",
        password_hash=hash_password("pass"),
        role="ops",
        is_active=True,
        failed_login_count=0,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _token(user):
    return create_access_token(subject=user.email, role=user.role, user_id=user.id)


def _add_event(db, days_ago: int) -> AuditEvent:
    ev = AuditEvent(actor="test", event="test.event", result="ok")
    db.add(ev)
    db.flush()
    ev.created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
    db.commit()
    return ev


class TestAuditPurge:
    def test_purge_deletes_old_events(self, client, db_session):
        admin = _make_admin(db_session)
        _add_event(db_session, days_ago=100)
        _add_event(db_session, days_ago=95)
        resp = client.delete(
            "/audit/purge?older_than_days=90",
            headers={"Authorization": f"Bearer {_token(admin)}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] >= 2

    def test_purge_keeps_recent_events(self, client, db_session):
        admin = _make_admin(db_session)
        ev = _add_event(db_session, days_ago=10)
        resp = client.delete(
            "/audit/purge?older_than_days=90",
            headers={"Authorization": f"Bearer {_token(admin)}"},
        )
        assert resp.status_code == 200
        assert db_session.get(AuditEvent, ev.id) is not None

    def test_purge_logs_audit_event(self, client, db_session):
        admin = _make_admin(db_session)
        client.delete(
            "/audit/purge?older_than_days=90",
            headers={"Authorization": f"Bearer {_token(admin)}"},
        )
        log = (
            db_session.query(AuditEvent)
            .filter(AuditEvent.event == "audit.purge")
            .first()
        )
        assert log is not None
        assert log.result == "ok"

    def test_purge_forbidden_for_ops(self, client, db_session):
        ops = _make_ops(db_session)
        resp = client.delete(
            "/audit/purge?older_than_days=90",
            headers={"Authorization": f"Bearer {_token(ops)}"},
        )
        assert resp.status_code == 403

    def test_purge_unauthenticated(self, client):
        resp = client.delete("/audit/purge?older_than_days=90")
        assert resp.status_code == 401

    def test_purge_invalid_days_rejected(self, client, db_session):
        admin = _make_admin(db_session)
        resp = client.delete(
            "/audit/purge?older_than_days=0",
            headers={"Authorization": f"Bearer {_token(admin)}"},
        )
        assert resp.status_code == 422
