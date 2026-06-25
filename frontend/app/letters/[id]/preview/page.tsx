import { notFound } from "next/navigation";

import type { P2Letter, P800Letter } from "@/lib/api";
import { getLetter } from "@/lib/api";
import { env } from "@/lib/env";
import { longDate, pounds, poundsSigned } from "@/lib/letter-format";

// The rendered letter must read as the genuine article. Every literal HMRC
// string below is traceable to backend/data/letter-samples/p2-verbatim-strings.md;
// only the per-letter fields (name, code, amounts, lines, confusing_line) come
// from the fetched model.

export default async function LetterPreview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const letter = await getLetter(id);
  if (letter === null) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:px-10 sm:py-16">
      <article className="relative bg-surface-raised px-7 py-10 sm:px-14 sm:py-14 ring-1 ring-rule">
        {letter.type === "p2" ? (
          <P2Body letter={letter} />
        ) : (
          <P800Body letter={letter} />
        )}

        <QrCorner id={id} />

        <footer className="mt-14 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
          {/* from: p2-verbatim-strings.md — standard retention + licence chrome */}
          <p>Please keep this notice. You may need it if you check your tax.</p>
          <p className="mt-2">
            Contains public sector information licensed under the Open
            Government Licence v3.0.
          </p>
        </footer>
      </article>
    </main>
  );
}

function Masthead({ title, taxYear }: { title: string; taxYear: string }) {
  // from: p2-verbatim-strings.md L1–L4 — the masthead block. The Crown logo is
  // deliberately not reproduced (OGL).
  return (
    <header className="border-b-2 border-rule-strong pb-4">
      <p className="font-display text-xl font-bold tracking-tight text-ink">
        HM Revenue &amp; Customs
      </p>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="tnum font-display text-sm uppercase tracking-[0.14em] text-ink-muted">
          Tax year {taxYear}
        </p>
      </div>
    </header>
  );
}

function P2Body({ letter }: { letter: P2Letter }) {
  return (
    <>
      {/* P2 letters cover 6 April → 5 April; render the full span from the
          stored "2026 to 2027" so the masthead reads like the issued letter. */}
      <Masthead
        title="PAYE Coding Notice"
        taxYear={taxYearSpan(letter.tax_year)}
      />

      <RecipientRow
        name={letter.recipient_name}
        nino={letter.nino_masked}
        issueDate={letter.issue_date}
      />

      {/* from: p2-verbatim-strings.md — salutation + opening paragraph */}
      <p className="mt-8 max-w-[60ch] text-lg">
        {salutation(letter.recipient_name)}
      </p>
      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed">
        This notice tells you about the tax code we will use to work out the
        Income Tax taken from your pay or pension.
      </p>
      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed">
        Your tax code is{" "}
        <span className="tnum font-semibold text-ink">
          {letter.current_code}
        </span>
        . We give this code to {letter.employer_name} so the right amount of tax
        is taken before you are paid.
      </p>

      <CodeTable letter={letter} />

      {/* The adjustments paragraph. The confusing_line is the model's verbatim
          hard sentence — highlighted as a proof mark, never paraphrased. */}
      <div className="mt-8 border-l-2 border-accent bg-accent/10 py-3 pl-4 pr-3 text-ink">
        <p className="max-w-[58ch] text-lg leading-relaxed">
          {letter.confusing_line}
        </p>
      </div>

      {/* from: p2-verbatim-strings.md — "what to do if wrong" footer */}
      <div className="mt-10 border-t border-rule pt-6">
        <h2 className="font-display text-lg tracking-tight">
          If you think your tax code is wrong
        </h2>
        <p className="mt-2 max-w-[60ch] text-lg leading-relaxed">
          If you think your tax code is wrong, please contact us. You can also
          check or update your details in your Personal Tax Account at
          www.gov.uk/personal-tax-account.
        </p>
      </div>
    </>
  );
}

function CodeTable({ letter }: { letter: P2Letter }) {
  return (
    <section className="mt-10">
      {/* from: p2-verbatim-strings.md — table heading, verbatim */}
      <h2 className="font-display text-xl tracking-tight">
        How we worked out your tax-free amount
      </h2>

      <table className="mt-4 w-full border-collapse text-lg">
        <thead>
          <tr className="border-y border-rule-strong text-left">
            <th className="py-2 pr-4 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              What we took into account
            </th>
            <th className="py-2 pl-4 text-right font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {letter.lines.map((line, i) => (
            <tr
              key={`${line.label}-${i}`}
              className="border-b border-rule align-top"
            >
              <td className="py-3 pr-4">
                <p className="font-medium text-ink">{line.label}</p>
                {/* the pre-written plain-english gloss, set as a muted aside */}
                <p className="mt-0.5 max-w-[52ch] text-base leading-snug text-ink-muted">
                  {line.plain_english}
                </p>
              </td>
              <td className="tnum py-3 pl-4 text-right text-ink">
                {poundsSigned(line.amount)}
              </td>
            </tr>
          ))}
          <tr className="border-b-2 border-rule-strong">
            <td className="py-3 pr-4 font-display text-lg font-semibold">
              Your tax-free amount
            </td>
            <td className="tnum py-3 pl-4 text-right font-display text-lg font-semibold">
              {pounds(letter.tax_free_amount)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4 max-w-[60ch] leading-relaxed text-ink-muted">
        We turn your tax-free amount into the code{" "}
        <span className="tnum font-semibold text-ink">
          {letter.current_code}
        </span>{" "}
        by removing the last digit. Someone with the full Personal Allowance and
        no other adjustments has the code{" "}
        <span className="tnum font-semibold text-ink">
          {letter.standard_code}
        </span>
        .
      </p>
    </section>
  );
}

function P800Body({ letter }: { letter: P800Letter }) {
  const overpaid = letter.result === "overpaid";
  return (
    <>
      <Masthead
        title="Tax Calculation"
        taxYear={taxYearSpan(letter.tax_year)}
      />

      <RecipientRow
        name={letter.recipient_name}
        nino={letter.nino_masked}
        reference={letter.p800_reference}
      />

      {/* from: p800-verbatim-strings.md — salutation + opening line */}
      <p className="mt-8 max-w-[60ch] text-lg">
        {salutation(letter.recipient_name)}
      </p>
      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed">
        We have checked the Income Tax you paid in the tax year{" "}
        {letter.tax_year}. Our calculation is set out below.
      </p>

      <table className="mt-8 w-full border-collapse text-lg">
        <tbody>
          <CalcRow
            label="Income you received"
            value={pounds(letter.total_income)}
          />
          <CalcRow
            label="Personal Allowance"
            value={pounds(letter.personal_allowance)}
          />
          <CalcRow
            label="Tax due on your income"
            value={pounds(letter.tax_due)}
          />
          <CalcRow
            label="Tax you have already paid"
            value={pounds(letter.tax_paid)}
          />
          <tr className="border-y-2 border-rule-strong">
            <td className="py-3 pr-4 font-display text-lg font-semibold">
              {overpaid ? "You are due a refund of" : "You owe"}
            </td>
            <td className="tnum py-3 pl-4 text-right font-display text-lg font-semibold text-accent">
              {pounds(letter.amount)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8 border-l-2 border-accent bg-accent/10 py-3 pl-4 pr-3 text-ink">
        <p className="max-w-[58ch] text-lg leading-relaxed">
          {letter.confusing_line}
        </p>
      </div>

      <div className="mt-10 border-t border-rule pt-6">
        <h2 className="font-display text-lg tracking-tight">
          {overpaid ? "How you will be paid" : "How to pay"}
        </h2>
        <p className="mt-2 max-w-[60ch] text-lg leading-relaxed">
          {letter.claim_method}
        </p>
      </div>
    </>
  );
}

function CalcRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-rule">
      <td className="py-3 pr-4 text-ink">{label}</td>
      <td className="tnum py-3 pl-4 text-right text-ink">{value}</td>
    </tr>
  );
}

function RecipientRow({
  name,
  nino,
  issueDate,
  reference,
}: {
  name: string;
  nino: string;
  issueDate?: string;
  reference?: string;
}) {
  return (
    <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-1 text-base sm:grid-cols-3">
      <Field label="Issued to" value={name} />
      <Field label="National Insurance number" value={nino} mono />
      {issueDate ? (
        <Field label="Date of issue" value={longDate(issueDate)} />
      ) : null}
      {reference ? <Field label="Reference" value={reference} mono /> : null}
    </dl>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border-t border-rule pt-2">
      <dt className="font-display text-[0.7rem] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </dt>
      <dd className={`mt-0.5 text-ink ${mono ? "tnum" : ""}`}>{value}</dd>
    </div>
  );
}

function QrCorner({ id }: { id: string }) {
  // One image, two entry points: a real scannable QR (camera apps read /l/{id})
  // and an anchor (clicks/taps go to the same destination). No JS short-circuit.
  return (
    <div className="mt-12 flex items-end justify-end border-t border-rule pt-6">
      <div className="text-right">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.14em] text-ink-faint">
          Confused by this letter?
        </p>
        <p className="mt-0.5 mb-2 max-w-[24ch] text-sm text-ink-muted">
          Scan to hear it explained in plain English.
        </p>
        <a
          href={`/l/${id}`}
          aria-label="Open this letter on a phone"
          className="inline-block ring-1 ring-rule transition-opacity duration-150 ease-out hover:opacity-80"
        >
          {/* Plain <img>, not next/image: the QR is served by FastAPI on a
              different origin and must rasterise identically into the PDF export. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${env.NEXT_PUBLIC_API_URL}/letters/${id}/qr.png`}
            alt="QR code — scan with your phone or click to open"
            width={160}
            height={160}
          />
        </a>
      </div>
    </div>
  );
}

// "2026 to 2027" → "6 April 2026 to 5 April 2027" (the tax-year span as printed).
function taxYearSpan(taxYear: string): string {
  const [start, end] = taxYear.split(" to ");
  if (start === undefined || end === undefined) return taxYear;
  return `6 April ${start} to 5 April ${end}`;
}

// from: p2-verbatim-strings.md — salutation pattern "Dear <name>,"
function salutation(name: string): string {
  return `Dear ${name},`;
}
