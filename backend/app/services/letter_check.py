"""Deterministic P2 formula audit.

This is the anti-hallucination beat: the tax-free amount and the suspected
overpayment are recomputed in plain code, never by the LLM. The agent is handed
the result of this function so that when a citizen asks "is this right?", it
surfaces a figure we derived rather than improvising one.
"""

from decimal import Decimal

from app.models.letters import P2Letter, SuspectedError


def _pounds_from_code(tax_code: str) -> Decimal:
    """The tax-free amount a suffix code encodes: drop the suffix letter, ×10.

    HMRC suffix codes (e.g. ``883L``) carry the tax-free amount in their digits:
    883 → £8,830. K codes (negative allowance) aren't used by the demo P2, so a
    non-suffix code here means the seed is malformed and should fail loudly.
    """
    digits = "".join(c for c in tax_code if c.isdigit())
    return Decimal(digits) * 10


def check_p2_letter(letter: P2Letter) -> list[SuspectedError]:
    derived = sum((line.amount for line in letter.lines), Decimal(0))

    if derived != letter.tax_free_amount:
        raise ValueError(
            f"P2 {letter.id}: lines sum to {derived} but tax_free_amount is "
            f"{letter.tax_free_amount}"
        )
    if derived != _pounds_from_code(letter.current_code):
        raise ValueError(
            f"P2 {letter.id}: tax_free_amount {derived} does not match code "
            f"{letter.current_code}"
        )

    return letter.suspected_errors
