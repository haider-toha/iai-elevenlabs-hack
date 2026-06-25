import io

import qrcode
from fastapi import APIRouter, HTTPException, Request, Response

from app.api.deps import DbConn
from app.models.letters import P2Letter, P800Letter, SuspectedError
from app.repositories.letters import get_letter
from app.services.letter_check import check_p2_letter

router = APIRouter(prefix="/letters", tags=["letters"])


@router.get("/{letter_id}", response_model=P2Letter | P800Letter)
async def read_letter(letter_id: str, db: DbConn) -> P2Letter | P800Letter:
    letter = await get_letter(db, letter_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Letter not found")
    return letter


@router.post("/{letter_id}/check", response_model=list[SuspectedError])
async def check_letter(letter_id: str, db: DbConn) -> list[SuspectedError]:
    letter = await get_letter(db, letter_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Letter not found")
    if not isinstance(letter, P2Letter):
        raise HTTPException(
            status_code=422, detail="The formula audit only applies to P2 letters"
        )
    return check_p2_letter(letter)


# No response_model by design: this route returns a binary PNG body, which
# Pydantic cannot model. The media type is documented via `responses` instead.
# Plain `def` (not async) so the blocking QR/PNG encode runs in FastAPI's
# threadpool and never stalls the event loop.
@router.get(
    "/{letter_id}/qr.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
def letter_qr(letter_id: str, request: Request) -> Response:
    # netloc is host[:port] (str); the deployed HTTPS host is what a phone scans.
    url = f"https://{request.url.netloc}/l/{letter_id}"
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image()
    buffer = io.BytesIO()
    img.save(buffer)
    return Response(content=buffer.getvalue(), media_type="image/png")
