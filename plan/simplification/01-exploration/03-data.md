# 03 — Data Layer Exploration (Marginalia simplification)

**Focus:** Where does data live, is it ever mutated at runtime, and can the
entire dataset be inlined as static TS/JSON to eliminate Postgres + Supabase?

**Bottom line:** The demo's runtime data is **two immutable, seeded letter rows**
read by slug through a single typed function. Nothing is mutated at runtime. The
`scan_events` and `organizations` tables, the `/check` and `/items` routes, and
the `govuk` / `letter-samples` corpora are all **dead in the demo flow**. The
dataset can be inlined wholesale; the only non-data backend remnant on the hot
path is QR-PNG generation, which needs only the slug.

---

## How the data is actually wired (runtime trace)

The browser's only data path to the backend is `NEXT_PUBLIC_API_URL`. Exhaustive
grep of `NEXT_PUBLIC_API_URL` usage in the frontend
(`frontend/lib/api.ts:15,92`, `frontend/app/letters/[id]/preview/page.tsx:359`)
yields exactly three backend touchpoints:

| Call | Where | Hits DB? |
|---|---|---|
| `GET /letters/{id}` | `frontend/lib/api.ts:91-98` `getLetter()` | **Yes** — `select * from letters where id = $1` (`backend/app/repositories/letters.py:16`) |
| `GET /letters/{id}/qr.png` | `frontend/app/letters/[id]/preview/page.tsx:359` (img src) | **No** — pure QR encode of `/l/{id}` from the slug (`backend/app/api/routers/letters.py:43-52`) |
| `GET /health` | `frontend/lib/api.ts:13` `getHealth()` | No — and **no caller**: grep for `getHealth` shows only its definition, never invoked in any page/component |

`getLetter()` is called in exactly three server components, all read-only:
- `frontend/app/(phone)/l/[id]/page.tsx:33` — the ConvAI cold-open
- `frontend/app/letters/[id]/preview/page.tsx:45` — the HMRC facsimile
- `frontend/app/(phone)/actions/update-company-car/[letterId]/page.tsx:21` — the GOV.UK mock form

The ElevenLabs route (`frontend/app/api/eleven/signed-url/route.ts`) calls
ElevenLabs directly and never touches the DB.

**No runtime write exists anywhere in the demo.** The only DB writer in the
codebase is `log_scan_event` (`backend/app/repositories/letters.py:27-39`),
reached only by `POST /scan-events` — and grep proves **no frontend code ever
POSTs to it** (the only `scan-events` / `scan_event` hits are backend
self-references). Letters are therefore strictly read-only at runtime; the only
thing that ever inserts a letter is the seed migration itself.

---

## BUCKET 1 — ACTIVELY USED AT RUNTIME

### `public.letters` table — the entire live dataset (2 rows)

- **Schema:** `supabase/migrations/20260625090000_create_letters.sql:17-50`.
  One table, both letter types, discriminated by `type` (`'p2' | 'p800'`);
  type-specific columns nullable. PK `id` is a **readable text slug**
  (deliberate deviation from the uuid convention), encoded in the QR/URL.
- **Seeded rows:** `supabase/migrations/20260625090200_seed_demo_letters.sql:14-66`.
- **TS shape already exists:** the Zod discriminated union in
  `frontend/lib/api.ts:31-85` (`p2Schema` / `p800Schema`) is the exact
  inline target. `money = z.coerce.number()` (`frontend/lib/api.ts:29`) means
  every numeric crosses as a JS `number` downstream — inline as plain numbers.
- **Consumed by:** the three `getLetter` server components above, plus
  `buildLetterBlock` / `buildLetterBlockWelsh` (`frontend/lib/letter-format.ts:34,78`)
  which fold the letter (lines, derived code, `suspected_errors`,
  `confusing_line`) into the agent's system-prompt block.
- **Mutated at runtime?** No. SELECT-only via `get_letter`.

#### Exact seeded data to inline (verbatim from the seed migration)

**`maria-p2`** (`...seed_demo_letters.sql:14-51`):
- `type` `p2`
- `recipient_name` `Ms Maria Davies`
- `nino_masked` `QQ 12 34 ▒▒ C`  ← note: stored with **▒▒ block glyphs**, not `56`
- `tax_year` `2026 to 2027`
- `personal_allowance` `12570`
- `confusing_line` `We have included an adjustment to reduce your tax-free allowance by £3,740 so we can collect the tax in equal instalments.`
- `issue_date` `2026-04-06` (serialized as ISO string; `frontend/lib/api.ts:53` treats it as `z.string()`)
- `employer_name` `Bridgwater & Co Ltd`
- `current_code` `883L`
- `standard_code` `1257L`
- `tax_free_amount` `8830`
- `lines` (JSONB array):
  1. `{ label: "Personal Allowance", amount: 12570, source_type: "allowance", plain_english: "The amount you can earn each year before you pay any Income Tax.", govuk_anchor: "income-tax" }`
  2. `{ label: "Car benefit", amount: -3740, source_type: "company_benefit", plain_english: "HMRC believes you get a company car. This lowers your tax-free amount, so more tax is collected from your pay.", govuk_anchor: "tax-company-benefits" }`
- `suspected_errors` (JSONB array):
  1. `{ line_label: "Car benefit", reason: "You told us you no longer have this company car — you returned it to your previous employer last year.", est_annual_overpay: 748, est_monthly_overpay: 62, fix_action: "Update your company car details in your Personal Tax Account so HMRC can correct your tax code." }`

**`maria-p800`** (`...seed_demo_letters.sql:55-66`):
- `type` `p800`
- `recipient_name` `Ms Maria Davies`
- `nino_masked` `QQ 12 34 ▒▒ C`
- `tax_year` `2025 to 2026`
- `personal_allowance` `12570`
- `confusing_line` `Our calculation shows you paid too much tax because your tax code did not change when your company car benefit ended.`
- `p800_reference` `P800-2026-0R4291`
- `total_income` `24800`
- `tax_due` `2446`
- `tax_paid` `3194`
- `result` `overpaid`
- `amount` `748`
- `claim_method` `online bank transfer (5 working days) or cheque (6 weeks)`

(The P800 has no `lines` / `suspected_errors` / P2 columns; the repo builds
`P800Letter` and Pydantic/Zod ignore the irrelevant nulls —
`backend/app/repositories/letters.py:22-24`.)

### QR PNG generation (data-adjacent, slug-only)

`backend/app/api/routers/letters.py:43-52` builds `https://{host}/l/{id}` and
encodes it. It reads **no DB data** — only the path slug. It is on the hot path
(facsimile page) but is trivial to relocate.

---

## BUCKET 2 — PRESENT BUT UNUSED AT RUNTIME

Every claim below is backed by "nothing references it at runtime."

### `public.scan_events` table — seeded, never read, never written in the demo
- Schema: `supabase/migrations/20260625090100_create_scan_events.sql:10-20`.
- ~50 synthetic rows seeded: `...seed_demo_letters.sql:71-123`.
- **Write path exists but is never invoked:** `POST /scan-events`
  (`backend/app/api/routers/scan_events.py:15-18`) → `log_scan_event`
  (`backend/app/repositories/letters.py:27-39`). Grep proves no frontend caller.
- **No read path exists at all:** there is no `GET /scan-events` route and no
  `SELECT` against `scan_events` anywhere (only the seed + the insert). The
  "confusion heatmap" the table is for has **no consumer** in this build.
- Conclusion: the table and its seed are 100% dead at runtime.

### `public.organizations` table — created, seeded, referenced by nothing
- Schema: `supabase/migrations/20260624101500_create_organizations.sql` (the
  reference "good migration" template).
- Seeded `Acme`: `supabase/seed.sql:4-6`.
- `grep -rn "organization" backend` → **zero hits** outside the migration/seed.
  No frontend reference either. Pure scaffold.

### `POST /letters/{id}/check` + `check_p2_letter` service — no caller
- Route: `backend/app/api/routers/letters.py:22-31`; service:
  `backend/app/services/letter_check.py:25-39`.
- Grep shows the only references are the route ↔ service wiring; **the frontend
  never POSTs to `/check`.** The audit figures it would return are instead
  inlined straight from `letter.suspected_errors` into the prompt
  (`frontend/lib/letter-format.ts:47-55`). The deterministic recompute is dead
  on the runtime path (it would still be worth keeping as a one-off seed
  validation if the data stays in SQL, but that's moot once inlined).

### `/items` router — in-memory scaffold, no DB, no caller
- `backend/app/api/routers/items.py:18-35` is an explicit "SCAFFOLD: in-memory
  stand-in" with a `dict` store. No frontend reference; no DB.

### `GET /health` / `getHealth()` — defined, never called
- `frontend/lib/api.ts:13-24`. Liveness probe, not data; no invocation anywhere.

### `backend/data/govuk/*.md` + `/govuk` router — grounding corpus, not fetched
- Six markdown files (`income-tax.md`, `tax-company-benefits.md`, etc.) and the
  `/govuk` router (`backend/app/api/routers/govuk.py`) that serves them.
- The letters' `govuk_anchor` values (`income-tax`, `tax-company-benefits` —
  `...seed_demo_letters.sql:30,37`) match these filenames, **but the frontend
  only embeds the anchor slug as a string in the prompt**
  (`frontend/lib/letter-format.ts:43,87`); it never fetches `/govuk`. Grep shows
  no `NEXT_PUBLIC_API_URL.../govuk` call. Unused in the demo runtime.

### `backend/data/letter-samples/*.md` — provenance docs only
- `SOURCES.md`, `p2-verbatim-strings.md`: human-facing source-of-truth for the
  seeded strings (cited by the migration header at `...seed_demo_letters.sql:4-5`
  and the facsimile's `RETURN_ADDRESS` comment at
  `frontend/app/letters/[id]/preview/page.tsx:18`). Never imported/executed at
  runtime. **Keep as the provenance reference when inlining strings** — they
  document which strings are authentic vs. fabricated.

---

## BUCKET 3 — AMBIGUOUS / NEEDS A DECISION

1. **QR PNG endpoint (the one real hot-path backend dependency).**
   `frontend/app/letters/[id]/preview/page.tsx:359` loads
   `${NEXT_PUBLIC_API_URL}/letters/{id}/qr.png`. To drop the backend this must
   move: generate the QR in a Next route handler / server component, or
   pre-render two static PNGs (only `maria-p2`, `maria-p800` exist). It depends
   on the runtime host (`request.url.netloc`, `letters.py:45`) and the slug —
   **no DB** — so relocation is mechanical. Decision: client/Next-side encode vs.
   build-time static asset.

2. **`nino_masked` value discrepancy.** Seed stores `QQ 12 34 ▒▒ C` (block
   glyphs) (`...seed_demo_letters.sql:21,61`), while
   `backend/data/letter-samples/p2-verbatim-strings.md:74,83` documents
   `QQ 12 34 56 C`. The facsimile renders `nino_masked` verbatim
   (`frontend/app/letters/[id]/preview/page.tsx:159,272`). Inline the **seeded**
   value (`▒▒`) to preserve current rendered output, unless a deliberate change
   is wanted.

3. **Numeric/Decimal typing across the (removed) boundary.** Today money is a
   PG `numeric` → JSON Decimal → coerced to JS `number`
   (`frontend/lib/api.ts:29`). When inlined as TS literals, use plain `number`
   and the `z.coerce.number()` boundary disappears. `issue_date` is a PG `date`
   → ISO string; keep it a string literal (`"2026-04-06"`) to match
   `frontend/lib/api.ts:53` and `monthYear()` (`frontend/lib/letter-format.ts:22`).

4. **`getLetter` async signature.** It's currently `async` returning
   `Letter | null`. Inlined, it becomes a synchronous slug lookup against a
   `Record<string, Letter>`; the three callers `await` it (harmless on a sync
   return) and already handle `null` via `notFound()`. The Zod schemas in
   `lib/api.ts` can be reused to type the inline map, or dropped in favor of the
   plain TS types (`P2Letter` / `P800Letter`).

---

## Can the dataset be inlined to eliminate Postgres + Supabase?

**Yes — decisively.** Evidence:

- The runtime reads exactly **two immutable rows**, keyed by slug, through one
  function (`getLetter`, `frontend/lib/api.ts:91`).
- **Zero runtime mutations** exist (the only writer, `log_scan_event`, is never
  called by the frontend).
- The exact TS shape is already defined (`frontend/lib/api.ts:31-85`) and the
  full row contents are quoted above.
- Everything else in the data layer — `scan_events`, `organizations`, `/check`,
  `/items`, `/health`, `govuk`, `letter-samples` — is provably unused on the
  demo path.

**Concrete inline plan:** replace `getLetter` with a static
`Record<"maria-p2" | "maria-p800", Letter>` (e.g. `frontend/lib/letters.ts`)
holding the two objects above; return the looked-up letter or `null`. This
deletes the entire FastAPI data path, the `asyncpg` pool/lifespan
(`backend/app/main.py:18-38`), all four migrations, `seed.sql`, and the Supabase
dependency. The **only** remaining backend concern is QR generation (slug-only,
Bucket 3 item 1), which can be moved into Next or pre-baked as two static PNGs.
