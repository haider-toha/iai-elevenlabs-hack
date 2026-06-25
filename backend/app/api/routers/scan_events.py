from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import DbConn
from app.models.scan_events import ScanEventCreate, ScanEventDashboard
from app.repositories.letters import get_scan_event_dashboard, log_scan_event

router = APIRouter(prefix="/scan-events", tags=["scan-events"])


class ScanEventLogged(BaseModel):
    status: str


@router.post("", response_model=ScanEventLogged, status_code=201)
async def create_scan_event(payload: ScanEventCreate, db: DbConn) -> ScanEventLogged:
    await log_scan_event(db, payload)
    return ScanEventLogged(status="logged")


@router.get("/aggregates", response_model=ScanEventDashboard)
async def read_aggregates(db: DbConn) -> ScanEventDashboard:
    return await get_scan_event_dashboard(db)
