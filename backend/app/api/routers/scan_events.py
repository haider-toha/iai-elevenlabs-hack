from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import DbConn
from app.models.scan_events import ScanEventCreate
from app.repositories.letters import log_scan_event

router = APIRouter(prefix="/scan-events", tags=["scan-events"])


class ScanEventLogged(BaseModel):
    status: str


@router.post("", response_model=ScanEventLogged, status_code=201)
async def create_scan_event(payload: ScanEventCreate, db: DbConn) -> ScanEventLogged:
    await log_scan_event(db, payload)
    return ScanEventLogged(status="logged")
