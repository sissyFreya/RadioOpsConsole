from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.models.base import Base


class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True)
    requested_by = Column(String(255), nullable=False)
    node_id = Column(Integer, nullable=False)
    service = Column(String(128), nullable=False)
    action = Column(String(32), nullable=False)  # restart|reload
    status = Column(String(32), nullable=False, default="queued")
    output = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
