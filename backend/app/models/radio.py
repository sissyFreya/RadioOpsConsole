from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Radio(Base):
    __tablename__ = "radios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    node_id = Column(Integer, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)

    icecast_service = Column(String(128), nullable=False, default="icecast2")
    liquidsoap_service = Column(String(128), nullable=False, default="liquidsoap")

    # Comma-separated mounts for MVP (keep simple). Example: "/stream,/hq"
    mounts = Column(String(512), nullable=False, default="/stream")

    # Where to listen from the browser (host-visible). Example: "http://localhost:8000"
    public_base_url = Column(String(512), nullable=False, default="http://localhost:8000")

    # Where the backend/agent should reach the stream (in-compose). Example: "http://icecast:8000"
    internal_base_url = Column(String(512), nullable=False, default="http://icecast:8000")

    node = relationship("Node")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
