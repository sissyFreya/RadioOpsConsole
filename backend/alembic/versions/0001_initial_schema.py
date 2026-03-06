"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-03-05 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("failed_login_count", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "nodes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("agent_url", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_nodes_id", "nodes", ["id"])

    op.create_table(
        "radios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("node_id", sa.Integer(), nullable=False),
        sa.Column("icecast_service", sa.String(128), nullable=False),
        sa.Column("liquidsoap_service", sa.String(128), nullable=False),
        sa.Column("mounts", sa.String(512), nullable=False),
        sa.Column("public_base_url", sa.String(512), nullable=False),
        sa.Column("internal_base_url", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_radios_id", "radios", ["id"])

    op.create_table(
        "actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requested_by", sa.String(255), nullable=False),
        sa.Column("node_id", sa.Integer(), nullable=False),
        sa.Column("service", sa.String(128), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("output", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_actions_id", "actions", ["id"])

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("event", sa.String(128), nullable=False),
        sa.Column("target", sa.String(255), nullable=True),
        sa.Column("result", sa.String(32), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_id", "audit_events", ["id"])

    op.create_table(
        "podcast_shows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_podcast_shows_id", "podcast_shows", ["id"])

    op.create_table(
        "podcast_episodes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("show_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("audio_rel_path", sa.String(512), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("recorded_from_radio_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["show_id"], ["podcast_shows.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_podcast_episodes_id", "podcast_episodes", ["id"])

    op.create_table(
        "live_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("radio_id", sa.Integer(), nullable=False),
        sa.Column("started_by", sa.String(255), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["radio_id"], ["radios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_live_sessions_id", "live_sessions", ["id"])


def downgrade() -> None:
    op.drop_table("live_sessions")
    op.drop_table("podcast_episodes")
    op.drop_table("podcast_shows")
    op.drop_table("audit_events")
    op.drop_table("actions")
    op.drop_table("radios")
    op.drop_table("nodes")
    op.drop_table("users")
