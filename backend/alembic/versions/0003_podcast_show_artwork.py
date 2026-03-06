"""Add artwork_url to podcast_shows

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-05 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "podcast_shows",
        sa.Column("artwork_url", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("podcast_shows", "artwork_url")
