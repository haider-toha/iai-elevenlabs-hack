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
        <h1 className="font-display text-4xl tracking-tight">Your letters</h1>
        <p className="mt-2 text-base text-ink-muted">
          Your recent conversations.
        </p>
        <div className="mt-4 h-0.5 w-10 bg-accent" aria-hidden />
      </header>

      <nav className="mt-8 border-t border-rule">
        {letters.map((letter) => (
          <Link
            key={letter.href}
            href={letter.href}
            className="group flex items-center justify-between gap-4 border-b border-rule py-5 transition duration-150 ease-out hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70"
          >
            <span className="flex flex-col">
              <span className="font-display text-xl tracking-tight text-ink">
                {letter.type}
              </span>
              <span className="mt-0.5 text-sm text-ink-muted">
                Tax year <span className="tnum">{letter.taxYear}</span>
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
    </main>
  );
}
