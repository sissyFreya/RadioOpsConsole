from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.models.base import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    actor = Column(String(255), nullable=False)
    event = Column(String(128), nullable=False)
    target = Column(String(255), nullable=True)
    result = Column(String(32), nullable=False, default="ok")
    details = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
