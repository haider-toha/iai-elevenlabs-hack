import Link from "next/link";

import { Wordmark } from "@/components/wordmark";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10 sm:py-24">
      <header className="flex items-center justify-between border-b border-rule-strong pb-3">
        <Wordmark />
        <span className="tnum font-display text-sm uppercase tracking-[0.18em] text-ink-faint">
          Prototype — {new Date().getUTCFullYear()}
        </span>
      </header>

      <section className="grid gap-x-12 gap-y-10 pt-14 md:grid-cols-12">
        <div className="md:col-span-9">
          <p className="font-display text-xs uppercase tracking-[0.18em] text-accent">
            The pitch
          </p>
          <h1 className="mt-4 text-4xl leading-[1.04] tracking-tight sm:text-5xl">
            Forty million times a year, someone in Britain opens a government
            letter they can&rsquo;t understand &mdash; and picks up the phone.
            We turn the QR code already on that letter into a thirty-second
            conversation, in any language, that explains it &mdash; and catches
            the mistake.
          </h1>
        </div>

        <aside className="md:col-span-3 md:pt-12">
          <div className="border-t border-rule pt-3">
            <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
              Demand it deletes
            </p>
            <p className="tnum mt-3 font-display text-5xl leading-none text-ink">
              40m
            </p>
            <p className="mt-2 text-base text-ink-muted">
              calls a year that needn&rsquo;t happen.
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-20 border-t border-rule-strong pt-3">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
          See it
        </p>
        <ul className="mt-2 divide-y divide-rule">
          <DemoLink
            n="01"
            href="/letters/maria-p2/preview"
            title="The demo letter"
            note="Maria&rsquo;s P2 coding notice — the line nobody can parse, highlighted, with the QR you scan to ask about it."
            cta="See the demo letter"
          />
          <DemoLink
            n="02"
            href="/dashboard"
            title="The confusion dashboard"
            note="Which sentences generate the most calls — the feedback loop that tells HMRC what to rewrite."
            cta="View dashboard"
          />
        </ul>
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

function DemoLink({
  n,
  href,
  title,
  note,
  cta,
}: {
  n: string;
  href: string;
  title: string;
  note: string;
  cta: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group grid grid-cols-12 items-baseline gap-4 py-6 transition-opacity duration-150 ease-out hover:opacity-70"
      >
        <span className="tnum col-span-2 font-display text-sm text-accent sm:col-span-1">
          {n}
        </span>
        <div className="col-span-10 sm:col-span-7">
          <span className="font-display text-2xl">{title}</span>
          <p className="mt-1 max-w-[52ch] text-ink-muted">{note}</p>
        </div>
        <span className="col-span-12 font-display text-base text-accent underline decoration-rule decoration-1 underline-offset-4 group-hover:decoration-accent sm:col-span-4 sm:text-right">
          {cta} &rarr;
        </span>
      </Link>
    </li>
  );
}
