from sqlalchemy import Column, DateTime, Integer, String, func

from app.models.base import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    agent_url = Column(String(512), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
