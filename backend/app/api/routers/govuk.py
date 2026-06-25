import asyncio
from pathlib import Path

import anyio
import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/govuk", tags=["govuk"])

# Verified-live GOV.UK Content API slugs for the grounding corpus. Guide pages
# carry their body in details.parts[*].body; others in details.body.
GOVUK_PATHS = [
    "tax-codes",
    "tax-overpayments-and-underpayments",
    "simple-assessment",
    "pay-self-assessment-tax-bill",
    "income-tax",
    "tax-company-benefits",
]

# backend/app/api/routers/govuk.py -> backend/data/govuk
GOVUK_DIR = Path(__file__).resolve().parents[3] / "data" / "govuk"


class GovukPart(BaseModel):
    body: str


class GovukDetails(BaseModel):
    parts: list[GovukPart] | None = None
    body: str | None = None


class GovukContent(BaseModel):
    title: str
    details: GovukDetails


class GovukRefreshResult(BaseModel):
    written: list[str]


def _to_plain_text(details: GovukDetails) -> str:
    if details.parts is not None:
        html = "\n\n".join(part.body for part in details.parts)
    else:
        html = details.body or ""
    return BeautifulSoup(html, "html.parser").get_text("\n", strip=True)


def _write_doc(out: Path, content: str) -> None:
    out.write_text(content, encoding="utf-8")


@router.post("/refresh", response_model=GovukRefreshResult)
async def refresh_govuk() -> GovukRefreshResult:
    await anyio.to_thread.run_sync(lambda: GOVUK_DIR.mkdir(parents=True, exist_ok=True))
    written: list[str] = []

    async with httpx.AsyncClient() as client:
        for path in GOVUK_PATHS:
            response = await client.get(f"https://www.gov.uk/api/content/{path}")
            if response.status_code == 404:
                raise HTTPException(
                    status_code=502, detail=f"GOV.UK page not found: {path}"
                )
            response.raise_for_status()
            doc = GovukContent.model_validate(response.json())

            out = GOVUK_DIR / f"{path}.md"
            content = f"# {doc.title}\n\n{_to_plain_text(doc.details)}\n"
            await anyio.to_thread.run_sync(_write_doc, out, content)
            written.append(out.name)

            await asyncio.sleep(0.1)

    return GovukRefreshResult(written=written)
