"""Set slug-based mounts (/{name-slug}) and per-radio liquidsoap_service (liquidsoap_{id})

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-23 00:00:00.000000

"""
from __future__ import annotations

import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(name: str, fallback: str = "radio") -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or fallback


def upgrade() -> None:
    conn = op.get_bind()

    rows = conn.execute(sa.text("SELECT id, name, mounts, liquidsoap_service FROM radios")).fetchall()
    for row in rows:
        radio_id, name, mounts, ls_service = row

        new_mount = mounts
        # Reassign mounts that are still numeric-ID-based or legacy /stream
        if not mounts or mounts == "/stream" or re.match(r"^/radio_\d+$", mounts or ""):
            slug = _slugify(name, fallback=f"radio-{radio_id}")
            new_mount = f"/{slug}"

        new_ls = ls_service
        # Reassign liquidsoap_service that is still the legacy generic name
        if not ls_service or ls_service in ("liquidsoap", ""):
            new_ls = f"liquidsoap_{radio_id}"

        if new_mount != mounts or new_ls != ls_service:
            conn.execute(
                sa.text(
                    "UPDATE radios SET mounts = :m, liquidsoap_service = :ls WHERE id = :id"
                ),
                {"m": new_mount, "ls": new_ls, "id": radio_id},
            )


def downgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM radios")).fetchall()
    for row in rows:
        radio_id = row[0]
        conn.execute(
            sa.text(
                "UPDATE radios SET mounts = :m, liquidsoap_service = :ls WHERE id = :id"
            ),
            {"m": f"/radio_{radio_id}", "ls": "liquidsoap", "id": radio_id},
        )
