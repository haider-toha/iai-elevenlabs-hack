import { notFound } from "next/navigation";

import { ConvaiLeaf } from "@/components/convai-leaf";
import { Wordmark } from "@/components/wordmark";
import type { Letter } from "@/lib/api";
import { getLetter } from "@/lib/api";
import { env } from "@/lib/env";
import {
  buildLetterBlock,
  buildLetterBlockWelsh,
  pounds,
} from "@/lib/letter-format";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const letter = await getLetter(id);
  if (letter === null) notFound();

  // Both blocks are built server-side and handed to the leaf as props: English
  // for the opening session, Welsh for the session restarted on request.
  const letterBlock = buildLetterBlock(letter);
  const letterBlockWelsh = buildLetterBlockWelsh(letter);

  const suspectedErrors = letter.type === "p2" ? letter.suspected_errors : [];
  // CodeLine → GOV.UK anchor pairs power the leaf's citation chips (the SDK
  // does not surface per-message source_attribution — see convai-leaf.tsx).
  const sources =
    letter.type === "p2"
      ? letter.lines.map((l) => ({ label: l.label, anchor: l.govuk_anchor }))
      : [];

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex items-baseline justify-between gap-4 border-b border-rule-strong pb-3">
        <span className="font-display text-sm font-medium uppercase tracking-[0.16em] text-ink-muted">
          HM Revenue &amp; Customs
        </span>
        <OneLoginButton />
      </header>

      <div className="grid gap-x-12 gap-y-10 pt-8 lg:grid-cols-12">
        <section className="lg:col-span-5">
          <CompactLetter letter={letter} />
        </section>

        <section className="lg:col-span-7">
          <ConvaiLeaf
            letterBlock={letterBlock}
            letterBlockWelsh={letterBlockWelsh}
            suspectedErrors={suspectedErrors}
            sources={sources}
            letterId={id}
          />
        </section>
      </div>

      <footer className="mt-16 border-t border-rule pt-4">
        <Wordmark size="sm" />
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Contains public sector information licensed under the Open Government
          Licence v3.0. This explains your letter — it is not formal tax advice.
        </p>
      </footer>
    </main>
  );
}

function CompactLetter({ letter }: { letter: Letter }) {
  return (
    <article className="bg-surface-raised px-6 py-7 ring-1 ring-rule">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
        {letter.type === "p2" ? "PAYE Coding Notice" : "Tax Calculation"} ·{" "}
        <span className="tnum">{letter.tax_year}</span>
      </p>
      <h1 className="mt-2 font-display text-2xl tracking-tight">
        {letter.recipient_name}
      </h1>

      {letter.type === "p2" ? (
        <dl className="mt-5 space-y-2 text-base">
          {letter.lines.map((line, i) => (
            <div
              key={`${line.label}-${i}`}
              className="flex items-baseline justify-between gap-4 border-b border-rule pb-2"
            >
              <dt className="text-ink">{line.label}</dt>
              <dd className="tnum text-ink-muted">{signed(line.amount)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="font-display font-semibold">Tax-free amount</dt>
            <dd className="tnum font-display font-semibold">
              {pounds(letter.tax_free_amount)} · code {letter.current_code}
            </dd>
          </div>
        </dl>
      ) : (
        <dl className="mt-5 space-y-2 text-base">
          <Row label="Total income" value={pounds(letter.total_income)} />
          <Row label="Tax due" value={pounds(letter.tax_due)} />
          <Row label="Tax paid" value={pounds(letter.tax_paid)} />
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="font-display font-semibold">
              {letter.result === "overpaid" ? "Refund due" : "You owe"}
            </dt>
            <dd className="tnum font-display font-semibold text-accent">
              {pounds(letter.amount)}
            </dd>
          </div>
        </dl>
      )}

      {/* the verbatim confusing sentence, highlighted as the proof mark */}
      <div className="mt-6 border-l-2 border-accent bg-accent/10 py-2 pl-3 pr-2">
        <p className="text-base leading-relaxed text-ink">
          {letter.confusing_line}
        </p>
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
      <dt className="text-ink">{label}</dt>
      <dd className="tnum text-ink-muted">{value}</dd>
    </div>
  );
}

function OneLoginButton() {
  // Styled stub for the "personalised actions" beat. It links to the One Login
  // simulator and never claims to return a National Insurance number (One Login
  // does not expose one).
  return (
    <a
      href={env.NEXT_PUBLIC_ONE_LOGIN_URL}
      className="rounded-tactile border border-rule-strong px-3 py-1.5 font-display text-sm font-medium text-ink transition-opacity duration-150 ease-out hover:opacity-70"
    >
      Sign in with GOV.UK One Login
    </a>
  );
}

function signed(amount: number): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${pounds(amount)}`;
}
