import Link from "next/link";

import { getScanEventDashboard } from "@/lib/api";
import type { LanguageCount, ScanEventAggregate } from "@/lib/api";

// Seeded language codes → the name we show. The map is editorial copy, not data;
// the counts and percentages come from the aggregate.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  cy: "Cymraeg",
  pl: "Polski",
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

// Human-readable label + a one-line gloss for each classified hotspot. The
// aggregate's `letter_section` is the join key; everything else here is editorial
// copy, not data, so it lives in the component rather than the API.
const SECTION_COPY: Record<string, { label: string; gloss: string }> = {
  adjustments: {
    label: "The adjustment line",
    gloss: "Why we reduced your tax-free allowance",
  },
  "tax-code": {
    label: "The tax code itself",
    gloss: "What 883L actually means",
  },
  "what-to-do": {
    label: "What to do if it's wrong",
    gloss: "How to correct the letter",
  },
  "personal-allowance": {
    label: "Personal Allowance",
    gloss: "The £12,570 starting point",
  },
  "company-car": {
    label: "Company car benefit",
    gloss: "How the car changes the figure",
  },
};

function sectionLabel(section: string): string {
  return SECTION_COPY[section]?.label ?? section.replace(/-/g, " ");
}

// The hottest section is oxblood; everything below it steps down through the two
// earthy status tokens by rank, so the heatmap reads as a single descending scale
// rather than an arbitrary palette.
function intensityClass(rank: number): string {
  if (rank === 0) return "bg-accent";
  if (rank === 1) return "bg-warning";
  return "bg-positive";
}

export default async function DashboardPage() {
  const dashboard = await getScanEventDashboard();
  const ranked = [...dashboard.sections].sort((a, b) => b.count - a.count);
  const totalQuestions = dashboard.total_count;
  const answeredCount = dashboard.answered_count;
  const hottest = ranked[0];

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10 sm:py-24">
      <header className="flex items-baseline justify-between border-b border-rule-strong pb-3">
        <span className="font-display text-sm font-medium uppercase tracking-[0.18em] text-ink-muted">
          Confusion heatmap
        </span>
        <Link
          href="/"
          className="font-display text-sm uppercase tracking-[0.18em] text-ink-faint transition-opacity duration-150 ease-out hover:opacity-70"
        >
          Index
        </Link>
      </header>

      <section className="grid gap-x-12 gap-y-10 pt-14 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="font-display text-xs uppercase tracking-[0.18em] text-accent">
            What citizens ask about
          </p>
          <h1 className="mt-4 text-4xl leading-[1.04] tracking-tight sm:text-5xl">
            Every question is a sentence HMRC could rewrite.
          </h1>
          <p className="mt-6 max-w-[60ch] text-xl text-ink-muted">
            Each scan logs which part of the letter the question was about
            &mdash; no names, no numbers. The hotter a section, the more often
            it sends someone reaching for the phone.
          </p>
        </div>

        <aside className="md:col-span-4 md:pt-8">
          <div className="border-t border-rule-strong pt-3">
            <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
              Questions answered, no phone call
            </p>
            <p className="tnum mt-3 font-display text-6xl leading-none text-accent">
              {answeredCount}
            </p>
            <p className="mt-3 max-w-[34ch] text-base text-ink-muted">
              Failure demand deleted: {answeredCount} of {totalQuestions}{" "}
              questions resolved in the conversation instead of an HMRC call
              queue.
            </p>
          </div>
        </aside>
      </section>

      <Heatmap ranked={ranked} total={totalQuestions} />

      <section className="mt-20 grid gap-x-12 gap-y-12 md:grid-cols-12">
        <div className="md:col-span-7">
          <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
            Top confusing phrase
          </p>
          <blockquote className="mt-4 border-l-2 border-accent pl-5">
            <p className="text-2xl leading-snug text-ink">
              &ldquo;We have included an adjustment to reduce your tax-free
              allowance by &pound;3,740 so we can collect the tax in equal
              instalments.&rdquo;
            </p>
            <footer className="mt-3 text-sm text-ink-muted">
              The verbatim P2 line behind{" "}
              <span className="text-accent">
                {hottest
                  ? sectionLabel(hottest.letter_section)
                  : "the adjustment"}
              </span>{" "}
              &mdash; HMRC&rsquo;s own research predicted it would dominate. The
              data above proves it from live usage.
            </footer>
          </blockquote>
        </div>

        <aside className="md:col-span-5">
          <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
            Languages served
          </p>
          <p className="mt-4 max-w-[40ch] text-base text-ink-muted">
            The conversation opens in English and switches to Welsh, Polish or
            any language the moment the citizen asks &mdash; in a native voice,
            not a mispronounced one.
          </p>
          <LanguageSplit languages={dashboard.languages} />
        </aside>
      </section>

      <footer className="mt-24 border-t border-rule pt-4">
        <p className="max-w-[60ch] text-sm text-ink-faint">
          Contains public sector information licensed under the Open Government
          Licence v3.0.
        </p>
      </footer>
    </main>
  );
}

function Heatmap({
  ranked,
  total,
}: {
  ranked: ScanEventAggregate[];
  total: number;
}) {
  const maxPct = ranked[0]?.pct ?? 100;

  return (
    <section className="mt-16 border-t border-rule-strong pt-3">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
          Question density by letter section
        </p>
        <p className="tnum font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
          {total} questions logged
        </p>
      </div>

      <ol className="mt-6 space-y-4">
        {ranked.map((agg, rank) => {
          const copy = SECTION_COPY[agg.letter_section];
          // Bars share a scale against the hottest section, so the leader fills
          // the row and the rest read as honest fractions of it.
          const width = maxPct === 0 ? 0 : (agg.pct / maxPct) * 100;
          return (
            <li key={agg.letter_section}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-display text-lg text-ink">
                  {sectionLabel(agg.letter_section)}
                </span>
                <span className="tnum shrink-0 text-sm text-ink-muted">
                  {agg.count} <span className="text-ink-faint">questions</span>
                </span>
              </div>
              {copy ? (
                <p className="mt-0.5 text-sm text-ink-muted">{copy.gloss}</p>
              ) : null}
              <div className="mt-2 h-7 w-full bg-surface-sunken">
                <div
                  className={`flex h-full items-center ${intensityClass(rank)}`}
                  style={{ width: `${Math.max(width, 6)}%` }}
                >
                  <span className="tnum px-2 text-xs font-medium text-ink-invert">
                    {agg.pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LanguageSplit({ languages }: { languages: LanguageCount[] }) {
  const ranked = [...languages].sort((a, b) => b.count - a.count);
  return (
    <ul className="tnum mt-5 space-y-2 text-base">
      {ranked.map((lang, rank) => (
        <li
          key={lang.language}
          className="flex items-baseline justify-between gap-4 border-t border-rule pt-2"
        >
          <span className={rank === 0 ? "text-accent" : "text-ink-muted"}>
            {languageName(lang.language)}
          </span>
          <span className="shrink-0 text-ink-faint">
            <span className="text-ink-muted">{lang.count}</span> &middot;{" "}
            {lang.pct.toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
