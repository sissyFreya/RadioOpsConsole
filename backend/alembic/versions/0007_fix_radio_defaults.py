"""Fix icecast_service default (icecast2→icecast) and assign unique mounts (/stream→/radio_{id})

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-23 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Fix legacy icecast_service value — Docker container is named "icecast", not "icecast2"
    op.execute("UPDATE radios SET icecast_service = 'icecast' WHERE icecast_service = 'icecast2'")

    # Assign unique per-radio mount path — each radio needs its own Icecast mount
    # Rows already having a custom mount (not "/stream" or empty) are left untouched.
    op.execute(
        "UPDATE radios SET mounts = '/radio_' || CAST(id AS VARCHAR) "
        "WHERE mounts = '/stream' OR mounts = '' OR mounts IS NULL"
    )


def downgrade() -> None:
    op.execute("UPDATE radios SET icecast_service = 'icecast2' WHERE icecast_service = 'icecast'")
    op.execute(
        "UPDATE radios SET mounts = '/stream' "
        "WHERE mounts LIKE '/radio_%'"
    )
