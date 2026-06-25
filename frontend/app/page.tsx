import { getHealth } from "@/lib/api";

const stack = [
  {
    n: "01",
    name: "Next.js",
    note: "App Router, React Server Components, TypeScript",
  },
  { n: "02", name: "FastAPI", note: "Python, Pydantic v2, async, Poetry" },
  {
    n: "03",
    name: "PostgreSQL",
    note: "Supabase CLI, SQL migrations, row-level security",
  },
  { n: "04", name: "Tailwind", note: "v4 CSS-first tokens, no config file" },
];

export default async function Home() {
  const health = await getHealth();

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10 sm:py-24">
      <header className="flex items-baseline justify-between border-b border-rule-strong pb-3">
        <span className="font-display text-sm font-medium uppercase tracking-[0.18em] text-ink-muted">
          i.AI Hackathon
        </span>
        <span className="tnum font-display text-sm uppercase tracking-[0.18em] text-ink-faint">
          No. 001 — {new Date().getUTCFullYear()}
        </span>
      </header>

      <section className="grid gap-x-12 gap-y-10 pt-14 md:grid-cols-12">
        <div className="md:col-span-8">
          <h1 className="text-5xl leading-[0.98] tracking-tight sm:text-7xl">
            A scaffold built to be{" "}
            <span className="text-accent italic">read</span>, not generated.
          </h1>
          <p className="mt-8 max-w-[60ch] text-xl text-ink-muted">
            Next.js, FastAPI, and PostgreSQL wired together with one
            constitution: every line justifies itself. No defensive padding, no
            stray <span className="italic">any</span>, no rounded-everything.
            Open <span className="font-display">CLAUDE.md</span> and start
            building.
          </p>
        </div>

        <aside className="md:col-span-4 md:pt-3">
          <div className="border-t border-rule pt-3">
            <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
              Services
            </p>
            <dl className="mt-4 space-y-3 text-base">
              <StatusRow label="Frontend" value="localhost:3000" ok />
              <StatusRow
                label="Backend"
                value={
                  health.online ? health.service : "offline — run make dev"
                }
                ok={health.online}
              />
            </dl>
          </div>
        </aside>
      </section>

      <section className="mt-20 border-t border-rule-strong pt-3">
        <p className="font-display text-xs uppercase tracking-[0.18em] text-ink-faint">
          The stack
        </p>
        <ol className="mt-2 divide-y divide-rule">
          {stack.map((item) => (
            <li
              key={item.n}
              className="grid grid-cols-12 items-baseline gap-4 py-5"
            >
              <span className="tnum col-span-2 font-display text-sm text-accent sm:col-span-1">
                {item.n}
              </span>
              <span className="col-span-10 font-display text-2xl sm:col-span-3">
                {item.name}
              </span>
              <span className="col-span-12 text-ink-muted sm:col-span-8">
                {item.note}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="flex items-baseline gap-2 text-right">
        <span
          aria-hidden
          className="size-2 translate-y-[-1px] rounded-tactile"
          style={{
            backgroundColor: ok
              ? "var(--color-accent)"
              : "var(--color-ink-faint)",
          }}
        />
        <span className="text-ink">{value}</span>
      </dd>
    </div>
  );
}
