import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 sm:px-10">
      <p className="font-display text-sm uppercase tracking-[0.18em] text-accent">
        404
      </p>
      <h1 className="mt-3 text-5xl tracking-tight sm:text-6xl">
        Nothing filed here.
      </h1>
      <p className="mt-6 max-w-[50ch] text-xl text-ink-muted">
        The page you asked for doesn&rsquo;t exist.{" "}
        <Link href="/" className="text-accent">
          Back to the index
        </Link>
        .
      </p>
    </main>
  );
}
