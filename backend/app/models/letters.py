from datetime import date
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class LetterType(StrEnum):
    P2 = "p2"
    P800 = "p800"


class CodeLine(BaseModel):
    """One row of the "how we worked out your tax-free amount" table."""

    label: str
    amount: Decimal  # signed: additions +, deductions −
    source_type: (
        str  # allowance | company_benefit | underpayment | state_pension | interest
    )
    plain_english: str  # pre-written gloss the agent can lean on
    govuk_anchor: str  # slug of the GOV.UK page that explains this line


class SuspectedError(BaseModel):
    """The "we caught it" payload — computed, never guessed."""

    line_label: str
    reason: str
    est_annual_overpay: Decimal
    est_monthly_overpay: Decimal
    fix_action: str


class P2Letter(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: LetterType = LetterType.P2
    recipient_name: str
    nino_masked: str  # "QQ 12 34 56 C" — stored masked
    tax_year: str  # "2026 to 2027"
    issue_date: date
    employer_name: str
    current_code: str  # "883L"
    standard_code: str  # "1257L" (what it would be with no deductions)
    personal_allowance: Decimal  # 12570
    lines: list[CodeLine]  # PA + additions − deductions
    tax_free_amount: Decimal  # derived; can be negative → K code
    confusing_line: str  # the verbatim hard sentence, for the page highlight
    suspected_errors: list[SuspectedError]


class P800Letter(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: LetterType = LetterType.P800
    recipient_name: str
    nino_masked: str
    p800_reference: str
    tax_year: str
    total_income: Decimal
    personal_allowance: Decimal
    tax_due: Decimal
    tax_paid: Decimal
    result: str  # "overpaid" | "underpaid"
    amount: Decimal
    claim_method: str  # "online bank transfer (5 working days) or cheque (6 weeks)"
    confusing_line: str
