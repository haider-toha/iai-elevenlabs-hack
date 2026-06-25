from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Annotated

import asyncpg
from asyncpg.pool import PoolConnectionProxy
from fastapi import Depends, Request

from app.config import Settings, get_settings

# asyncpg's PoolConnectionProxy/Pool are generic to the type checker
# (asyncpg-stubs) but are NOT subscriptable at runtime in 0.30.x. FastAPI calls
# get_type_hints() on every dependency, so the runtime annotations must use the
# bare classes; mypy still sees the real `[Record]` generics via this alias.
if TYPE_CHECKING:
    DbConnProxy = PoolConnectionProxy[asyncpg.Record]
    DbPool = asyncpg.Pool[asyncpg.Record]
else:
    DbConnProxy = PoolConnectionProxy
    DbPool = asyncpg.Pool

# Reusable dependency aliases. Inject these, never read env or construct
# Settings ad hoc.
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_db(request: Request) -> AsyncIterator[DbConnProxy]:
    pool: DbPool = request.app.state.pool
    async with pool.acquire() as conn:
        yield conn


DbConn = Annotated[DbConnProxy, Depends(get_db)]
