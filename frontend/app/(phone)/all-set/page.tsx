import Link from "next/link";

import { SaveChatStub } from "./save-chat-stub";

// Screen 10 — the editorial success screen (§2). Reached from the GOV.UK
// confirmation's close control, after the voice session has already ended.
// Hard-coded, persists nothing, no auth, no backend. The oxblood tick is the
// proof mark; "Finish" is the single primary CTA → the citizen home.
export default function AllSetPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col px-6">
      <div className="flex flex-1 flex-col justify-center">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-14 w-14 text-accent"
        >
          <path d="M10 25.5 L20 35 L38.5 13" />
        </svg>

        <h1 className="mt-8 font-display text-5xl tracking-tight">
          You&rsquo;re all set.
        </h1>
        <p className="mt-4 max-w-[34ch] text-lg text-ink-muted">
          You can come back anytime if you have more questions.
        </p>
      </div>

      <footer className="shrink-0 pt-4 pb-6">
        <SaveChatStub />
        <Link
          href="/"
          className="mt-2 flex w-full items-center justify-center rounded-tactile bg-accent px-5 py-3.5 font-display text-base font-medium text-ink-invert transition duration-150 ease-out hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-px active:opacity-95"
        >
          Finish
        </Link>
      </footer>
    </main>
  );
}
