"""Rebuild live_sessions with full schema (show_id, mount, title, recording_id, etc.)

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-06 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old minimal schema and recreate with the full model schema.
    # (Old columns: radio_id, started_by, started_at, ended_at, status)
    op.drop_table("live_sessions")
    op.create_table(
        "live_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("radio_id", sa.Integer(), nullable=False),
        sa.Column("show_id", sa.Integer(), nullable=False),
        sa.Column("mount", sa.String(256), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("recording_id", sa.String(128), nullable=False),
        sa.Column("output_rel_path", sa.String(1024), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["radio_id"], ["radios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["show_id"], ["podcast_shows.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_live_sessions_id", "live_sessions", ["id"])


def downgrade() -> None:
    op.drop_table("live_sessions")
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
