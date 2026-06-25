from pydantic import BaseModel, ConfigDict


class ScanEventCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    letter_type: str
    letter_section: str
    language: str
    resolved: bool
    session_seconds: int


class ScanEventAggregate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    letter_section: str
    count: int
    pct: float


class LanguageCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    language: str
    count: int
    pct: float


class ScanEventDashboard(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sections: list[ScanEventAggregate]
    languages: list[LanguageCount]
    answered_count: int  # resolved = true — answered without a phone call
    total_count: int
