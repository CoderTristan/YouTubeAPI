import asyncio
from database import engine, Base
from models import UserToken, AnalyticsSnapshot

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(create())
