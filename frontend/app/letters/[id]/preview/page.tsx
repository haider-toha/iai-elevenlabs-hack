import Image from "next/image";
import { notFound } from "next/navigation";

import type { P2Letter, P800Letter } from "@/lib/api";
import { getLetter } from "@/lib/api";
import { BackButton } from "@/components/back-button";
import { env } from "@/lib/env";
import { monthYear, pounds, poundsSigned } from "@/lib/letter-format";

// This page is a deliberate exception to the app's editorial design system: it
// must read as a scanned government letter — white paper, black ink, a system
// sans, a dense near-full-width measure, no colour. The Arial stack is set on
// the <article> so every descendant inherits it; the one <h1> repeats it inline
// (and resets tracking) because globals.css sets a display font + negative
// letter-spacing on h1–h4 directly, which an inherited font can't override.
const SANS = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

// from: p2-verbatim-strings.md — the HMRC PAYE return address, as printed.
const RETURN_ADDRESS = [
  "HM Revenue & Customs",
  "PAYE AS YOU EARN",
  "HM REVENUE AND CUSTOMS",
  "BX9 1AS",
] as const;

// Placeholder citizen address — the recipient block on a real P2 carries the
// full postal address under the name; we don't store one, so this holds the
// shape until real address data lands. Welsh-formatted, since the letter can
// be served in either English or Welsh.
const RECIPIENT_ADDRESS = [
  "47 Stryd Fawr",
  "Caerdydd",
  "CF10 1AX",
] as const;

// HMRC PAYE general enquiries line — a fixed published number, not per-letter.
const HMRC_PHONE = "0300 200 3300";

export default async function LetterPreview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const letter = await getLetter(id);
  if (letter === null) notFound();

  return (
    // A neutral-grey backdrop so the white letter reads as a document on a
    // surface, not against the app's warm bone chrome.
    <div className="min-h-dvh bg-neutral-100">
      <main className="mx-auto max-w-3xl px-6 py-12 sm:px-10 sm:py-16">
        {/* Editorial back chevron as page chrome — kept OUTSIDE the white
            <article> so the HMRC facsimile stays white/black/Arial. -ml-2.5
            aligns the chevron ink with the article's left edge. */}
        <div className="-ml-2.5 mb-6">
          <BackButton href="/" />
        </div>
        <article
          className="bg-white px-8 py-10 text-black shadow-sm ring-1 ring-neutral-200 sm:px-12 sm:py-12"
          style={{ fontFamily: SANS }}
        >
          {letter.type === "p2" ? (
            <P2Body letter={letter} />
          ) : (
            <P800Body letter={letter} />
          )}

          <QrBlock id={id} />

          <LetterFooter formCode={letter.type === "p2" ? "P2 (New)" : "P800"} />
        </article>
      </main>
    </div>
  );
}

function Masthead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header>
      <div className="flex items-center justify-between gap-6">
        <Image
          src="/HMRC_logo.png"
          alt="HM Revenue & Customs"
          width={208}
          height={117}
          priority
          className="h-auto w-[150px] sm:w-[178px]"
        />
        <div className="text-right">
          {/* The page's single document heading; inline font + tracking reset
              override the app's h1 display face (see SANS note above). */}
          <h1
            style={{ fontFamily: SANS }}
            className="text-lg font-bold leading-tight tracking-normal sm:text-xl"
          >
            {title}
          </h1>
          <p className="mt-1 text-sm">{subtitle}</p>
        </div>
      </div>
      {/* The heavy band under the masthead — an HMRC print signature. Bled to
          the paper edges so it spans full width like the scan. */}
      <div className="mt-4 -mx-8 h-1.5 bg-black sm:-mx-12" />
    </header>
  );
}

function LetterMeta({
  recipient,
  note,
  details,
}: {
  recipient: string;
  note: string;
  details: { label: string; value: string }[];
}) {
  return (
    <section className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
      <address className="text-sm not-italic leading-relaxed">
        {recipient}
        <div className="mt-1">
          {RECIPIENT_ADDRESS.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </address>

      <div className="text-sm leading-relaxed">
        <p>{note}</p>
        <div className="mt-3">
          {RETURN_ADDRESS.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {/* Labels bold, values left-aligned one line below — the scan's detail
            block. `whitespace-nowrap` keeps each value intact; `flex-wrap` lets
            a long label push its value to a second line as a whole unit
            instead of word-breaking it across the narrow right column. */}
        <dl className="mt-12 flex flex-col gap-3">
          {details.map((d) => (
            <div
              key={d.label}
              className="flex flex-wrap items-baseline gap-x-3"
            >
              <dt className="font-bold">{d.label}</dt>
              <dd className="tnum whitespace-nowrap">{d.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function P2Body({ letter }: { letter: P2Letter }) {
  const details = [
    { label: "Phone", value: HMRC_PHONE },
    { label: "National Insurance number", value: letter.nino_masked },
    { label: "Date", value: monthYear(letter.issue_date) },
  ];

  return (
    <>
      <Masthead
        title="PAYE Coding Notice"
        subtitle={`Tax code for the year ${taxYearShort(letter.tax_year)}`}
      />

      <LetterMeta
        recipient={letter.recipient_name}
        // from: p2-verbatim-strings.md — the keep-your-notices note, verbatim.
        note="Please keep all your Coding Notices. You may need to use them if you have to fill in a tax return. Please tell us your tax reference and National Insurance number if you contact us."
        details={details}
      />

      <p className="mt-10 text-sm">{salutation(letter.recipient_name)}</p>

      <p className="mt-5 text-base font-bold leading-snug">
        Your tax code for the year from {taxYearSpan(letter.tax_year)} is{" "}
        <span className="tnum">{letter.current_code}</span>
      </p>

      <p className="mt-4 text-sm leading-relaxed">
        {letter.employer_name} will use this tax code to work out how much tax
        to take off the amount they pay you from {taxYearStart(letter.tax_year)}
        . It is important that you check your tax code is right. You do not need
        to contact us unless you think your tax code is wrong. If you contact us
        you will need your National Insurance number and tax reference.
      </p>

      <CodeBox letter={letter} />

      <p className="mt-6 text-sm leading-relaxed">
        We take <span className="tnum">{pounds(letter.tax_free_amount)}</span>{" "}
        into a tax code of <span className="tnum">{letter.current_code}</span>.{" "}
        {letter.employer_name} will use this code to take off the right amount
        of tax each time they pay you from {taxYearStart(letter.tax_year)}. We
        tell them your tax code, but we do not tell them how we worked it out.
        Someone with the full Personal Allowance and no other adjustments has
        the code <span className="tnum">{letter.standard_code}</span>.
      </p>

      {/* The model's verbatim "hardest sentence" — on a real letter it sits in
          the body prose, so it renders as a plain paragraph, never a callout. */}
      <p className="mt-4 text-sm leading-relaxed">{letter.confusing_line}</p>

      <Notes lines={letter.lines} />
    </>
  );
}

function CodeBox({ letter }: { letter: P2Letter }) {
  return (
    <section className="mt-6 border border-black">
      <p className="px-4 pb-1 pt-3 text-sm font-bold">
        This is how we worked out your tax code:
      </p>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {letter.lines.map((line, i) => (
            <tr key={`${line.label}-${i}`}>
              <td className="py-1 pl-4 pr-2">{line.label}</td>
              {/* Additions print unsigned, deductions carry a real minus — the
                  scan signs only the adjustments, not the base allowance. */}
              <td className="tnum whitespace-nowrap px-2 py-1 text-right">
                {line.amount < 0
                  ? poundsSigned(line.amount)
                  : pounds(line.amount)}
              </td>
              <td className="whitespace-nowrap py-1 pl-2 pr-4 text-left">
                (see Note {i + 1} )
              </td>
            </tr>
          ))}
          {/* The closing tax-free amount, set apart by a thin rule over the
              figure column only — as in the scan, not a heavy full-width rule. */}
          <tr>
            <td className="py-1 pl-4 pr-2">a tax-free amount of</td>
            <td className="tnum whitespace-nowrap border-t border-black px-2 py-1 text-right">
              {pounds(letter.tax_free_amount)}
            </td>
            <td className="py-1 pl-2 pr-4" />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function Notes({ lines }: { lines: P2Letter["lines"] }) {
  return (
    <section className="mt-8">
      <p className="text-sm font-bold">Notes</p>
      <ol className="mt-2 space-y-3">
        {lines.map((line, i) => (
          <li key={`note-${i}`} className="flex gap-3 text-sm leading-relaxed">
            <span className="tnum w-4 shrink-0">{i + 1}</span>
            <span>{line.plain_english}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function P800Body({ letter }: { letter: P800Letter }) {
  const overpaid = letter.result === "overpaid";
  const details = [
    { label: "Phone", value: HMRC_PHONE },
    { label: "National Insurance number", value: letter.nino_masked },
    { label: "Reference", value: letter.p800_reference },
  ];

  return (
    <>
      <Masthead
        title="Tax Calculation"
        subtitle={`Tax year ${taxYearShort(letter.tax_year)}`}
      />

      <LetterMeta
        recipient={letter.recipient_name}
        note="Please tell us your reference and National Insurance number if you contact us."
        details={details}
      />

      <p className="mt-10 text-sm">{salutation(letter.recipient_name)}</p>
      <p className="mt-4 text-sm leading-relaxed">
        We have checked the Income Tax you paid in the tax year{" "}
        {letter.tax_year}. Our calculation is set out below.
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
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
          <tr className="border-y-2 border-black">
            <td className="py-2 pr-4 font-bold">
              {overpaid ? "You are due a refund of" : "You owe"}
            </td>
            <td className="tnum py-2 pl-4 text-right font-bold">
              {pounds(letter.amount)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-6 text-sm leading-relaxed">{letter.confusing_line}</p>

      <div className="mt-8">
        <p className="text-sm font-bold">
          {overpaid ? "How you will be paid" : "How to pay"}
        </p>
        <p className="mt-2 text-sm leading-relaxed">{letter.claim_method}</p>
      </div>
    </>
  );
}

function CalcRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-300">
      <td className="py-2 pr-4">{label}</td>
      <td className="tnum py-2 pl-4 text-right">{value}</td>
    </tr>
  );
}

function QrBlock({ id }: { id: string }) {
  // One image, two entry points: a real scannable QR (camera apps read /l/{id})
  // and an anchor (clicks/taps go to the same destination). No JS short-circuit.
  return (
    <section className="mt-12 flex justify-end">
      <div className="max-w-[16rem] text-right">
        <a
          href={`/l/${id}`}
          aria-label="Open this letter on a phone"
          className="inline-block border border-black transition-opacity duration-150 ease-out hover:opacity-80"
        >
          {/* Plain <img>, not next/image: the QR is served by FastAPI on a
              different origin and must rasterise identically into the PDF export. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${env.NEXT_PUBLIC_API_URL}/letters/${id}/qr.png`}
            alt="QR code — scan with your phone or click to open"
            width={140}
            height={140}
          />
        </a>
        <p className="mt-2 text-xs leading-snug">
          Scan with your phone to interact with this letter.        </p>
      </div>
    </section>
  );
}

function LetterFooter({ formCode }: { formCode: string }) {
  return (
    <footer className="mt-12 grid grid-cols-3 items-end pt-3 text-xs">
      <span className="font-bold">{formCode}</span>
      <span className="text-center">Page 1</span>
      <span />
    </footer>
  );
}

// "2026 to 2027" → "6 April 2026 to 5 April 2027" (the tax-year span as printed).
function taxYearSpan(taxYear: string): string {
  const [start, end] = taxYear.split(" to ");
  if (start === undefined || end === undefined) return taxYear;
  return `6 April ${start} to 5 April ${end}`;
}

// "2026 to 2027" → "6 April 2026" (the tax-year start, as printed in body prose).
function taxYearStart(taxYear: string): string {
  const [start] = taxYear.split(" to ");
  return start === undefined ? taxYear : `6 April ${start}`;
}

// "2026 to 2027" → "2026-27" (the compact masthead form).
function taxYearShort(taxYear: string): string {
  const [start, end] = taxYear.split(" to ");
  if (start === undefined || end === undefined) return taxYear;
  return `${start}-${end.slice(2)}`;
}

// from: p2-verbatim-strings.md — salutation pattern "Dear <name>,"
function salutation(name: string): string {
  return `Dear ${name},`;
}
