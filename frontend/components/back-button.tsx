import Link from "next/link";

// The editorial back chevron, factored out of the summary screen's existing
// control (convai-leaf.tsx) so every screen's back affordance is identical. A
// plain Link with an inlined chevron — server-compatible, no client hooks.
export function BackButton({
  href,
  label = "Back",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-10 place-items-center text-ink-muted transition-opacity duration-150 ease-out active:opacity-60"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="size-5 rotate-180"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 3.5 5 4.5-5 4.5" />
      </svg>
    </Link>
  );
}
