# PEP 563: PoolConnectionProxy[asyncpg.Record] in the signatures below is a
# real generic to mypy (asyncpg-stubs) but not subscriptable at runtime, so the
# annotations must stay strings.
from __future__ import annotations

import asyncpg
from asyncpg.pool import PoolConnectionProxy

from app.models.letters import LetterType, P2Letter, P800Letter
from app.models.scan_events import (
    LanguageCount,
    ScanEventAggregate,
    ScanEventCreate,
    ScanEventDashboard,
)


async def get_letter(
    conn: PoolConnectionProxy[asyncpg.Record], letter_id: str
) -> P2Letter | P800Letter | None:
    row = await conn.fetchrow("select * from letters where id = $1", letter_id)
    if row is None:
        return None
    # jsonb `lines`/`suspected_errors` are already Python lists via the pool
    # codec; Pydantic ignores the letter-type-irrelevant columns sitting as None.
    data = dict(row)
    if row["type"] == LetterType.P2:
        return P2Letter.model_validate(data)
    return P800Letter.model_validate(data)


async def log_scan_event(
    conn: PoolConnectionProxy[asyncpg.Record], event: ScanEventCreate
) -> None:
    await conn.execute(
        "insert into scan_events"
        " (letter_type, letter_section, language, resolved, session_seconds)"
        " values ($1, $2, $3, $4, $5)",
        event.letter_type,
        event.letter_section,
        event.language,
        event.resolved,
        event.session_seconds,
    )


async def get_scan_event_dashboard(
    conn: PoolConnectionProxy[asyncpg.Record],
) -> ScanEventDashboard:
    section_rows = await conn.fetch(
        "select letter_section, count(*) as count,"
        " round(count(*) * 100.0 / sum(count(*)) over (), 1) as pct"
        " from scan_events group by letter_section order by count desc"
    )
    language_rows = await conn.fetch(
        "select language, count(*) as count,"
        " round(count(*) * 100.0 / sum(count(*)) over (), 1) as pct"
        " from scan_events group by language order by count desc"
    )
    totals = await conn.fetchrow(
        "select count(*) filter (where resolved) as answered_count,"
        " count(*) as total_count from scan_events"
    )
    # scan_events is always seeded, so the totals row is never None.
    assert totals is not None
    return ScanEventDashboard(
        sections=[ScanEventAggregate.model_validate(dict(row)) for row in section_rows],
        languages=[LanguageCount.model_validate(dict(row)) for row in language_rows],
        answered_count=totals["answered_count"],
        total_count=totals["total_count"],
    )
