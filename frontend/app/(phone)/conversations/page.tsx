import Link from "next/link";

import { BackButton } from "@/components/back-button";

// Screen 12 — "Your letters" (§2 / §1.8). The first two rows are the seeded
// fixtures (each with its OWN real tax year); the third is a demo-only row with
// no seeded letter, so it parks on "#". Persists nothing, no list endpoint.
const letters = [
  { href: "/l/maria-p800", title: "Tax Calculation", date: "28 Apr 2024" },
  { href: "/l/maria-p2", title: "PAYE Coding Notice", date: "12 Jan 2025" },
  { href: "#", title: "Self Assessment Confirmation", date: "28 Dec 2024" },
];

export default function ConversationsPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col px-6">
      <header className="shrink-0 pt-4">
        {/* -ml-2.5 optically aligns the chevron ink with the heading below; the
            size-10 touch target is wider than the glyph it centres. */}
        <div className="-ml-2.5">
          <BackButton href="/" />
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Your letters
        </h1>
        <p className="mt-2 text-base text-ink-muted">
          Your recent conversations.
        </p>
      </header>

      <nav className="mt-8 flex flex-col gap-3">
        {letters.map((letter) => (
          <Link
            key={letter.title}
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
                  {letter.title}
                </span>
                <span className="mt-0.5 text-sm text-ink-muted tnum">
                  {letter.date}
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

        <Link
          href="#"
          className="group flex items-center justify-between gap-4 rounded-card bg-mist px-5 py-3.5 transition duration-150 ease-out hover:bg-lavender focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70"
        >
          <span className="font-display text-base font-medium text-ink">
            View all conversations
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
      </nav>
    </main>
  );
}
