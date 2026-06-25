"""Seed the GOV.UK knowledge-base markdown without standing up the server.

Standalone ops script: `poetry run python backend/scripts/pull_govuk.py`.
For each GOV.UK path it calls the Content API directly (no key, <=10 req/s),
strips the HTML body to plain text, and writes backend/data/govuk/{path}.md.
The agent bootstrap (setup_eleven_agent.py) then uploads those files to the KB.

Self-contained on purpose so it does not import the FastAPI app or its router.
"""

from __future__ import annotations

import asyncio
from html.parser import HTMLParser
from pathlib import Path

import httpx

GOVUK_API = "https://www.gov.uk/api/content"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "govuk"

# Verified-live guides (document_type: guide -> body in details.parts[].body).
PATHS: list[str] = [
    "tax-codes",
    "tax-overpayments-and-underpayments",
    "simple-assessment",
    "pay-self-assessment-tax-bill",
    "income-tax",
    "tax-company-benefits",
]


class _TextExtractor(HTMLParser):
    """Collect visible text, dropping <script>/<style> and tag markup."""

    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data.strip():
            self._chunks.append(data.strip())

    @property
    def text(self) -> str:
        return "\n".join(self._chunks)


def strip_html(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return parser.text


async def pull_govuk(client: httpx.AsyncClient, path: str) -> tuple[str, str]:
    r = await client.get(f"{GOVUK_API}/{path}")
    r.raise_for_status()
    doc = r.json()
    title: str = doc["title"]
    parts = doc["details"].get("parts")
    html = "\n\n".join(p["body"] for p in parts) if parts else doc["details"]["body"]
    return title, strip_html(html)


async def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=30.0) as client:
        for path in PATHS:
            title, text = await pull_govuk(client, path)
            out = OUTPUT_DIR / f"{path}.md"
            out.write_text(f"# {title}\n\n{text}\n")
            print(f"Wrote {out} ({len(text)} chars)")
            await asyncio.sleep(0.1)  # respect <=10 req/s across the batch


if __name__ == "__main__":
    asyncio.run(main())
