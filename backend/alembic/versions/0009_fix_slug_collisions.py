"""Deduplicate slug-based mounts — append -id suffix when two radios share a slug

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-23 00:00:00.000000

"""
from __future__ import annotations

import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, mounts FROM radios ORDER BY id")
    ).fetchall()

    seen: dict[str, int] = {}  # mount → first radio_id that claimed it
    for row in rows:
        radio_id, mount = row
        if mount in seen:
            # Collision: rename this (later) radio by appending its id
            new_mount = f"{mount}-{radio_id}"
            conn.execute(
                sa.text("UPDATE radios SET mounts = :m WHERE id = :id"),
                {"m": new_mount, "id": radio_id},
            )
        else:
            seen[mount] = radio_id


def downgrade() -> None:
    # Collision disambiguation is not reversible without extra bookkeeping — no-op
    pass
