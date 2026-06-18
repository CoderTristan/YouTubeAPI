# models.py
from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from database import Base

class UserToken(Base):
    __tablename__ = "user_tokens"

    user_id = Column(String, primary_key=True)
    access_token = Column(String)
    refresh_token = Column(String)
    token_data = Column(JSONB)
    updated_at = Column(DateTime, default=datetime.utcnow)

class AnalyticsSnapshot(Base):
    __tablename__ = "analytics_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String)
    endpoint = Column(String)  # e.g. "videos", "traffic", "geo"
    snapshot = Column(JSONB)   # store the entire API response
    created_at = Column(DateTime, default=datetime.utcnow)
