import Link from "next/link";

// Screen 12 — "Your letters" (§2 / §1.8). A hard-coded two-item list bound to
// the two seeded fixtures, each with its OWN real tax year (note they differ).
// Persists nothing, no list endpoint, no per-user model.
const letters = [
  { href: "/l/maria-p2", type: "PAYE Coding Notice", taxYear: "2026 to 2027" },
  { href: "/l/maria-p800", type: "Tax Calculation", taxYear: "2025 to 2026" },
];

export default function ConversationsPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col px-6">
      <header className="shrink-0 pt-7">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          Your letters
        </h1>
        <p className="mt-2 text-base text-ink-muted">
          Your recent conversations.
        </p>
      </header>

      <nav className="mt-8 flex flex-col gap-3">
        {letters.map((letter) => (
          <Link
            key={letter.href}
            href={letter.href}
            className="group flex items-center justify-between gap-4 rounded-card bg-white px-5 py-4 shadow-card transition duration-150 ease-out hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70"
          >
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-tactile bg-lavender text-navy"
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
                  <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                  <path d="M14 3v4h4" />
                  <path d="M9 13h6M9 16.5h4" />
                </svg>
              </span>
              <span className="flex flex-col">
                <span className="font-display text-xl font-semibold tracking-tight text-ink">
                  {letter.type}
                </span>
                <span className="mt-0.5 text-sm text-ink-muted">
                  Tax year <span className="tnum">{letter.taxYear}</span>
                </span>
              </span>
            </span>
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
          </Link>
        ))}
      </nav>
    </main>
  );
}
