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
      <header className="shrink-0 pb-3 pt-7">
        <span className="font-display text-lg font-semibold uppercase tracking-[0.22em] text-ink">
          Marginalia<span className="text-accent">.</span>
        </span>
      </header>

      <div className="flex flex-1 flex-col pt-10">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Good morning.
        </h1>
        <p className="mt-3 text-lg text-ink-muted">How can I help today?</p>

        <nav className="mt-10 flex flex-col gap-3">
          {actions.map((action, i) => {
            const isScan = i === 0;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={`group flex items-center justify-between gap-4 rounded-card px-5 py-4 shadow-card transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70 ${
                  isScan ? "bg-lavender" : "bg-white hover:bg-mist"
                }`}
              >
                <span className="flex items-center gap-3">
                  {isScan ? (
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-tactile bg-white text-navy"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-5"
                      >
                        <path d="M6.5 7 8 4.5h8L17.5 7H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
                        <circle cx="12" cy="13" r="3.25" />
                      </svg>
                    </span>
                  ) : null}
                  <span className="flex flex-col">
                    <span className="font-display text-xl font-semibold tracking-tight text-ink">
                      {action.title}
                    </span>
                    <span className="mt-0.5 text-base text-ink-muted">
                      {action.blurb}
                    </span>
                  </span>
                </span>
                {isScan ? null : (
                  <span
                    aria-hidden
                    className="shrink-0 text-ink-faint transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-5"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <footer className="shrink-0 py-6">
        <div className="flex items-start gap-3 rounded-card bg-mist p-4">
          <span aria-hidden className="mt-0.5 shrink-0 text-ink-faint">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <p className="max-w-[42ch] text-sm leading-relaxed text-ink-faint">
            Your letters stay private. We don&rsquo;t share your letters or
            conversations with anyone.
          </p>
        </div>
      </footer>
    </main>
  );
}
