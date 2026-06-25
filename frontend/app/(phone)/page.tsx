import Link from "next/link";

// Screen 11 — the citizen home (§2). Hard-coded, persists nothing, no auth, no
// fetch. The two affordances are the only entry points: there is no in-app
// scanner (Screen 1 is binned), so "Scan a letter" opens the scannable physical
// letter, and "Continue" re-opens a recent letter fresh (sessions are ephemeral).
const actions = [
  {
    href: "/letters/maria-p2/preview",
    title: "Scan a letter",
    blurb: "I'll explain it simply.",
  },
  {
    href: "/l/maria-p2",
    title: "Continue a previous letter",
    blurb: "Open a recent conversation.",
  },
];

export default function HomePage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col px-6">
      <header className="shrink-0 border-b-2 border-rule-strong pb-3 pt-7">
        <span className="font-display text-lg font-semibold uppercase tracking-[0.22em] text-ink">
          Marginalia<span className="text-accent">.</span>
        </span>
      </header>

      <div className="flex flex-1 flex-col pt-10">
        <h1 className="font-display text-5xl tracking-tight">Good morning.</h1>
        <p className="mt-3 text-lg text-ink-muted">How can I help today?</p>

        <nav className="mt-10 border-t border-rule">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-center justify-between gap-4 border-b border-rule py-5 transition duration-150 ease-out hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70"
            >
              <span className="flex flex-col">
                <span className="font-display text-xl tracking-tight text-ink">
                  {action.title}
                </span>
                <span className="mt-0.5 text-base text-ink-muted">
                  {action.blurb}
                </span>
              </span>
              <span
                aria-hidden
                className="font-display text-2xl text-ink-faint transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <footer className="shrink-0 border-t border-rule py-6">
        <p className="max-w-[42ch] text-sm leading-relaxed text-ink-faint">
          Your letters stay private. We don&rsquo;t share your letters or
          conversations with anyone.
        </p>
      </footer>
    </main>
  );
}
