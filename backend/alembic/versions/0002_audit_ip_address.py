"""Add ip_address to audit_events

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-05 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "audit_events",
        sa.Column("ip_address", sa.String(45), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("audit_events", "ip_address")
