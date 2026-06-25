# PEP 563: asyncpg's Connection/Pool are generic to mypy (asyncpg-stubs) but not
# subscriptable at runtime in 0.30.x, so the subscripted annotations below must
# stay strings.
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import govuk, health, items, letters, scan_events
from app.config import get_settings


async def _init_conn(conn: asyncpg.Connection[asyncpg.Record]) -> None:
    # Decode jsonb columns to Python list/dict so Pydantic gets native structures.
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # Local DATABASE_URL is a direct connection (54322); no statement_cache_size=0
    # — that is only for the 6543 transaction pooler.
    pool: asyncpg.Pool[asyncpg.Record] = await asyncpg.create_pool(
        settings.database_url, init=_init_conn
    )
    app.state.pool = pool
    yield
    await pool.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(items.router)
    app.include_router(letters.router)
    app.include_router(govuk.router)
    app.include_router(scan_events.router)
    return app


app = create_app()
