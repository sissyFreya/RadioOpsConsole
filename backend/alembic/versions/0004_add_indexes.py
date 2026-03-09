"""Add performance indexes on frequently filtered columns

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-09 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_audit_events_actor", "audit_events", ["actor"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])
    op.create_index("ix_radios_node_id", "radios", ["node_id"])
    op.create_index("ix_podcast_episodes_show_id", "podcast_episodes", ["show_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor", table_name="audit_events")
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_index("ix_radios_node_id", table_name="radios")
    op.drop_index("ix_podcast_episodes_show_id", table_name="podcast_episodes")
