from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import SettingsDep

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get("/health", response_model=HealthResponse)
async def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name)
