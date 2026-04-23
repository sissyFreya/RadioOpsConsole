"""Add FK on actions.node_id, performance indexes on actions, unique constraint on nodes.name

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-23 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    op.create_index("ix_actions_node_id", "actions", ["node_id"])
    op.create_index("ix_actions_status", "actions", ["status"])
    op.create_index("ix_actions_created_at", "actions", ["created_at"])

    # SQLite does not support ALTER TABLE ADD CONSTRAINT — these are Postgres/MySQL only.
    if dialect != "sqlite":
        op.create_foreign_key(
            "fk_actions_node_id", "actions", "nodes", ["node_id"], ["id"],
            ondelete="RESTRICT",
        )
        op.create_unique_constraint("uq_nodes_name", "nodes", ["name"])


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect != "sqlite":
        op.drop_constraint("uq_nodes_name", "nodes", type_="unique")
        op.drop_constraint("fk_actions_node_id", "actions", type_="foreignkey")

    op.drop_index("ix_actions_created_at", table_name="actions")
    op.drop_index("ix_actions_status", table_name="actions")
    op.drop_index("ix_actions_node_id", table_name="actions")
