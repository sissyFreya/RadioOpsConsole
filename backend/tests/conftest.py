"""
Shared pytest fixtures.

Uses an in-memory SQLite database so tests never need a running Postgres.
Alembic migrations are intentionally bypassed here — we use create_all()
which is fine for test isolation (no persistent state between runs).
"""
from __future__ import annotations

import os
import tempfile

# Must be set before any app import so Settings() picks it up and StaticFiles
# gets a writable directory that actually exists on this machine.
os.environ.setdefault("MEDIA_ROOT", tempfile.mkdtemp(prefix="radioops_test_"))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import get_db
from app.models.base import Base

# Import all models so Base knows about them
import app.models.user       # noqa: F401
import app.models.node       # noqa: F401
import app.models.radio      # noqa: F401
import app.models.action     # noqa: F401
import app.models.audit      # noqa: F401
import app.models.podcast    # noqa: F401
import app.models.live       # noqa: F401


SQLITE_URL = "sqlite://"  # pure in-memory, discarded after each test


@pytest.fixture()
def db_engine():
    # StaticPool ensures all connections share the same in-memory SQLite database,
    # which is required for test isolation when using sqlite://.
    engine = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    Session = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session):
    """TestClient with DB dependency overridden to use in-memory SQLite."""
    import unittest.mock
    from app.main import app
    from app.core.limiter import limiter

    # Clear all in-memory rate-limit counters so tests don't bleed into each other.
    limiter.reset()

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db

    # The app uses a lifespan context manager (not on_startup handlers), so we
    # patch the two startup functions that need a live Postgres / agent.
    with (
        unittest.mock.patch("app.main._run_alembic_upgrade"),
        unittest.mock.patch("app.main.bootstrap"),
        unittest.mock.patch("app.main._purge_old_audit_events"),
        unittest.mock.patch("app.services.agent_client.setup_agent_client"),
        unittest.mock.patch("app.services.agent_client.teardown_agent_client"),
        unittest.mock.patch("app.services.cache.setup_cache"),
        unittest.mock.patch("app.services.cache.teardown_cache"),
    ):
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c

    app.dependency_overrides.clear()


@pytest.fixture()
def admin_token(client, db_session):
    """Create an admin user and return a valid JWT token."""
    from app.core.security import hash_password, create_access_token
    from app.models.user import User

    user = User(
        email="admin@test.local",
        password_hash=hash_password("correct-password"),
        role="admin",
        is_active=True,
        failed_login_count=0,
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token(subject=user.email, role=user.role)
    return token


@pytest.fixture()
def viewer_token(db_session):
    """Create a viewer user and return a valid JWT token."""
    from app.core.security import hash_password, create_access_token
    from app.models.user import User

    user = User(
        email="viewer@test.local",
        password_hash=hash_password("viewer-pass"),
        role="viewer",
        is_active=True,
        failed_login_count=0,
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token(subject=user.email, role=user.role)
    return token
