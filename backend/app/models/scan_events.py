from pydantic import BaseModel, ConfigDict


class ScanEventCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    letter_type: str
    letter_section: str
    language: str
    resolved: bool
    session_seconds: int
