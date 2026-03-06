"""Tests for track upload security (S8 from Phase 1)."""
from __future__ import annotations

import io
import pytest
from app.models.node import Node
from app.models.radio import Radio


def _make_radio(db) -> Radio:
    node = Node(name="n", agent_url="http://x:9000")
    db.add(node)
    db.commit()
    db.refresh(node)

    radio = Radio(
        name="Test Radio",
        node_id=node.id,
        icecast_service="icecast",
        liquidsoap_service="liquidsoap",
        mounts="/stream",
        public_base_url="http://localhost:8000",
        internal_base_url="http://icecast:8000",
    )
    db.add(radio)
    db.commit()
    db.refresh(radio)
    return radio


class TestTrackUpload:
    def test_upload_rejected_extension(self, client, admin_token, db_session, tmp_path):
        radio = _make_radio(db_session)
        fake_exe = io.BytesIO(b"MZ\x90\x00")  # fake exe header
        resp = client.post(
            f"/radios/{radio.id}/tracks/upload",
            files={"file": ("malware.exe", fake_exe, "application/octet-stream")},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400
        assert "not allowed" in resp.json()["detail"].lower()

    def test_upload_valid_wav(self, client, admin_token, db_session, tmp_path, monkeypatch):
        # Use a subdir of MEDIA_ROOT so relative_to(media_root) works in the upload handler.
        from app.core.config import settings
        import app.api.radios as radios_module
        tracks_dir = settings.media_root_path / "test_tracks"
        tracks_dir.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(radios_module, "_radio_tracks_dir", lambda radio_id: tracks_dir)

        radio = _make_radio(db_session)
        wav_bytes = io.BytesIO(b"RIFF\x00\x00\x00\x00WAVEfmt ")
        resp = client.post(
            f"/radios/{radio.id}/tracks/upload",
            files={"file": ("test.wav", wav_bytes, "audio/wav")},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "test.wav"

    def test_upload_nonexistent_radio(self, client, admin_token):
        fake_audio = io.BytesIO(b"\x00" * 100)
        resp = client.post(
            "/radios/9999/tracks/upload",
            files={"file": ("song.mp3", fake_audio, "audio/mpeg")},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404

    def test_upload_requires_auth(self, client, db_session):
        radio = _make_radio(db_session)
        fake_audio = io.BytesIO(b"\x00" * 100)
        resp = client.post(
            f"/radios/{radio.id}/tracks/upload",
            files={"file": ("song.mp3", fake_audio, "audio/mpeg")},
        )
        assert resp.status_code == 401
