"use client";

import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Letter, P2Letter, P800Letter, SuspectedError } from "@/lib/api";
import { env } from "@/lib/env";
import { pounds, poundsSigned } from "@/lib/letter-format";

// "system" is a non-spoken boundary marker (e.g. the one-time Welsh switch beat),
// rendered as a centred divider rather than a bubble — it is not a conversation turn.
type Turn = { role: "user" | "agent" | "system"; text: string };
type Source = { label: string; anchor: string };
type Language = "en" | "cy";

// The three internal view-states of the one /l/[id] route (§1.2). The provider +
// session live across all of them, mounted once; a phase change never unmounts
// the session. "preparing" is the cold-open reading theatre (Screen 2),
// "summary" is the findings card (Screen 3), "conversation" is the live voice UI
// (Screens 4-9). These are NOT sub-routes and read no ?step= URL state.
type Phase = "preparing" | "summary" | "conversation";

// The agent triggers `switch_language` (registered server-side, param `target`)
// when the user asks for Welsh. The wire passes parameters as an untyped record,
// so the handler narrows `target` itself rather than widening our types to any.
type ConvaiTools = {
  switch_language: (params: Record<string, unknown>) => void;
};

// The leaf takes the typed Letter and the two prompt blocks built server-side.
// sources / suspected errors / id are derived from the letter here rather than
// drilled as separate props — one source of truth, exhaustive over the union.
type LeafProps = {
  letter: Letter;
  letterBlock: string;
  letterBlockWelsh: string;
};

const PROMPT_CHIPS = [
  "What does my tax code mean?",
  "Why did it change?",
  "Is this correct?",
  "What do I need to do?",
];

// The reading-theatre checklist (Screen 2). Hard-coded demo copy mapping to no
// real processing — the letter is already structured in Postgres (D8).
const READING_STEPS = [
  "Extracting key details",
  "Understanding the content",
  "Identifying important information",
  "Finding official guidance",
  "Preparing your summary",
];

const WELSH_FIRST_MESSAGE =
  "Helo, gallaf weld bod gennych hysbysiad cod treth gan CThEM. Beth hoffech chi ei wybod?";
const ENGLISH_FIRST_MESSAGE =
  "Hi, I can see you've got a tax code notice from HMRC. Which language would you like to continue in?";

// A growing per-character timeline: for each char of the agent's current
// response, the absolute wall-clock time (performance.now() ms) at which it
// should be voiced. Each `audio_alignment` event appends one chunk's chars,
// converting its relative `char_start_times_ms` into absolute timestamps by
// anchoring to the moment that chunk arrived.
type RevealTimeline = {
  spokenAtMs: number[];
};

// Small lead so a word appears just before the voice hits it, instead of
// trailing behind. Keeps the reveal feeling "live" without spoiling phrases.
const REVEAL_LEAD_MS = 120;

// v1.8.0 is provider-based: the provider holds the session machinery and the
// inner component drives it through the conversation hooks. The provider must
// wrap every component that calls `useConversation*`, so the leaf is the boundary.
export function ConvaiLeaf(props: LeafProps) {
  return (
    <ConversationProvider>
      <ConvaiSession {...props} />
    </ConversationProvider>
  );
}

function ConvaiSession({ letter, letterBlock, letterBlockWelsh }: LeafProps) {
  const [phase, setPhase] = useState<Phase>("preparing");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [agentLive, setAgentLive] = useState("");
  const [revealedCount, setRevealedCount] = useState(0);
  const [language, setLanguage] = useState<Language>("en");
  const [error, setError] = useState<string | null>(null);
  const [agentHasReplied, setAgentHasReplied] = useState(false);
  const [draft, setDraft] = useState("");

  // Absolute spoken-at timestamps per char of the *current* agent response.
  // A ref (not state) because the reveal interval mutates it on every audio
  // chunk and reads it every ~30ms without needing to re-render the tree.
  const timeline = useRef<RevealTimeline>({ spokenAtMs: [] });
  // The transcript scroll region + the typed-input element; refs so we can
  // auto-scroll to the latest turn and focus the input on "Type instead".
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInputOnEnter = useRef(false);

  // Derived from the typed letter, exhaustive over the P2 | P800 union — P800
  // has neither lines nor suspected errors, so both collapse to [] (the action
  // card + citations simply never show for it; no crash).
  const letterId = letter.id;
  const suspectedErrors: SuspectedError[] =
    letter.type === "p2" ? letter.suspected_errors : [];
  const sources: Source[] =
    letter.type === "p2"
      ? letter.lines.map((l) => ({ label: l.label, anchor: l.govuk_anchor }))
      : [];

  // v1.8.0's convenience hook: it both reads status / exposes the session
  // controls AND registers these callbacks with the provider via a latest-
  // closure ref, so the handlers always see the current state setters. `mode`
  // is the SDK's speaking/listening axis, additively destructured for the orb.
  const { status, mode, startSession, endSession, sendUserMessage } =
    useConversation({
      onMessage: (m) => {
        if (m.source === "user") {
          setTranscript((t) => [...t, { role: "user", text: m.message }]);
        }
        if (m.source === "ai") {
          setTranscript((t) => [...t, { role: "agent", text: m.message }]);
          setAgentHasReplied(true);
        }
      },
      onAgentChatResponsePart: (part) => {
        // part: { text, type: "start" | "delta" | "stop", event_id }.
        // We accumulate the *target* text from deltas but gate visibility on the
        // audio timeline below — so the user sees text appear in step with the
        // voice, not in jumpy LLM chunks.
        if (part.type === "start") {
          setAgentLive("");
          setRevealedCount(0);
          timeline.current = { spokenAtMs: [] };
        } else if (part.type === "delta") {
          setAgentLive((s) => s + part.text);
        } else if (part.type === "stop") {
          setAgentLive("");
          setRevealedCount(0);
          timeline.current = { spokenAtMs: [] };
        }
      },
      onAudioAlignment: (a) => {
        // Field names are snake_case on the wire (AudioEventAlignment). Convert
        // each char's chunk-relative start into an absolute performance.now() ms
        // and append to the cumulative timeline. The reveal interval below
        // walks this timeline to drive `revealedCount`.
        const anchor = performance.now();
        const next = timeline.current.spokenAtMs.slice();
        for (let i = 0; i < a.chars.length; i++) {
          next.push(anchor + (a.char_start_times_ms[i] ?? 0));
        }
        timeline.current = { spokenAtMs: next };
      },
      // onError(message, context) — the first arg is the message string, not an
      // Error object. Surface it inline rather than logging to a console nobody
      // watches during a demo.
      onError: (message) => setError(message),
      onStatusChange: ({ status }) => {
        if (status === "disconnected") {
          setAgentLive("");
          setRevealedCount(0);
          timeline.current = { spokenAtMs: [] };
        }
      },
    });
  const live = status === "connected" || status === "connecting";

  // Audio-paced reveal: ~30ms tick (≈animation frame cadence) walks the
  // cumulative spoken-at timeline and advances `revealedCount` to the last
  // char whose voiced moment has passed (+ a small lead so words appear just
  // before the audio hits them rather than chasing it).
  useEffect(() => {
    if (status !== "connected") return;
    const tick = window.setInterval(() => {
      const now = performance.now() + REVEAL_LEAD_MS;
      const timestamps = timeline.current.spokenAtMs;
      let i = 0;
      while (i < timestamps.length && timestamps[i]! <= now) i++;
      setRevealedCount((prev) => (i > prev ? i : prev));
    }, 30);
    return () => window.clearInterval(tick);
  }, [status]);

  // Screen 2 → 3 reconciliation (§1.1 vs §Screen-2): the reading theatre is NOT
  // a redirect, NOT a sub-route, and reads no `?step=` URL state — /l/[id]
  // renders itself self-sufficiently and the brief intro simply resolves to the
  // summary in this same client subtree. CRITICAL (§1.5/§4.7): it must NEVER
  // call startSession/getUserMedia or auto-advance into the session — the voice
  // session only starts later on a FRESH user tap in `summary`. This is the one
  // sanctioned setTimeout in the leaf.
  useEffect(() => {
    if (phase !== "preparing") return;
    const id = window.setTimeout(() => setPhase("summary"), 3000);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Keep the latest turn / live caret in view as the transcript grows — but only
  // when the reader is already near the bottom, so scrolling up to re-read an
  // earlier turn isn't yanked back every 30ms reveal tick.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [transcript, revealedCount, phase]);

  // Focus the typed input when "Type instead" brought us into the conversation.
  useEffect(() => {
    if (phase === "conversation" && focusInputOnEnter.current) {
      focusInputOnEnter.current = false;
      inputRef.current?.focus();
    }
  }, [phase]);

  async function startInEnglish() {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const signedUrl = await fetchSignedUrl();
      setLanguage("en");
      startSession({
        signedUrl,
        overrides: {
          agent: {
            prompt: { prompt: letterBlock },
            language: "en",
            firstMessage: ENGLISH_FIRST_MESSAGE,
          },
          tts: { voiceId: env.NEXT_PUBLIC_XI_VOICE_ID_ENGLISH },
        },
      });
    } catch (e) {
      setError(messageOf(e));
    }
  }

  // A clean session restart (ElevenLabs can't hot-swap voice), with the Welsh
  // letter block, the native Welsh voice, and language "cy".
  async function restartInWelsh() {
    setError(null);
    try {
      endSession();
      const signedUrl = await fetchSignedUrl();
      setLanguage("cy");
      // The reconnect beat (§4.9): a one-time, explicit transcript boundary so
      // the switch reads as a deliberate handover, not a dropped/duplicated turn.
      // It sits between the English turns above and the Welsh ones the restarted
      // session will append below.
      setTranscript((t) => [
        ...t,
        { role: "system", text: "Switching to Welsh" },
      ]);
      startSession({
        signedUrl,
        overrides: {
          agent: {
            prompt: { prompt: letterBlockWelsh },
            language: "cy",
            firstMessage: WELSH_FIRST_MESSAGE,
          },
          tts: { voiceId: env.NEXT_PUBLIC_XI_VOICE_ID_WELSH },
        },
      });
    } catch (e) {
      setError(messageOf(e));
    }
  }

  // The Welsh beat: the agent calls the `switch_language` client tool (param
  // `target`, e.g. "cy"). v1.8.0 registers client tools with the provider; the
  // handler reflects the latest closure, so it can call restartInWelsh above.
  useConversationClientTool<ConvaiTools>("switch_language", (params) => {
    if (targetIsWelsh(readTarget(params))) void restartInWelsh();
  });

  // The sacred start chain (§1.5): getUserMedia → fetchSignedUrl → startSession
  // stays inside this direct user tap. startInEnglish() is invoked
  // synchronously so getUserMedia is reached within the gesture; never move it
  // into an effect/timeout/router transition.
  function beginConversation(focusInput: boolean) {
    focusInputOnEnter.current = focusInput;
    void startInEnglish();
    setPhase("conversation");
  }

  // The docked X. Hiding the live voice view without unmounting the provider
  // would leave the mic/WebSocket/wake-lock alive, so ending here is REQUIRED,
  // not redundant unmount teardown (§1.3) — the provider stays mounted.
  function endConversation() {
    endSession();
    setPhase("summary");
  }

  function askChip(text: string) {
    if (!live) return;
    // Optimistically show the question immediately — the chip must register on
    // tap for the demo. sendUserMessage injects text (not transcribed speech),
    // so the server does not echo it back as a user_transcript onMessage event;
    // if a future SDK starts echoing, dedupe here on the trailing user turn.
    setTranscript((t) => [...t, { role: "user", text }]);
    sendUserMessage(text);
  }

  function onSubmitDraft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !live) return;
    askChip(text);
    setDraft("");
  }

  const hasUserTurn = transcript.some((t) => t.role === "user");
  const showPrompts = live && !hasUserTurn;
  const showActionCard = suspectedErrors.length > 0 && agentHasReplied;
  const topError = suspectedErrors[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {phase === "preparing" ? (
        <PreparingView />
      ) : phase === "summary" ? (
        <SummaryView
          letter={letter}
          onChat={() => beginConversation(false)}
          onType={() => beginConversation(true)}
        />
      ) : (
        <>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {error !== null ? (
              <p
                role="alert"
                className="mb-3 rounded-tactile border-l-2 border-accent bg-accent/10 py-2 pl-3 pr-2 text-base text-ink"
              >
                {error}
              </p>
            ) : null}

            {transcript.length === 0 && agentLive === "" && error === null ? (
              <p className="mt-8 text-center text-base text-ink-faint">
                {status === "connecting"
                  ? "Connecting to Marginalia…"
                  : status === "connected"
                    ? "Marginalia is getting ready…"
                    : "Starting…"}
              </p>
            ) : null}

            <TranscriptBubbles
              items={transcript}
              live={agentLive}
              revealedCount={revealedCount}
            />

            {agentHasReplied && sources.length > 0 ? (
              <CitationChips sources={sources} />
            ) : null}

            {showActionCard && topError !== undefined ? (
              <ActionCard error={topError} letterId={letterId} />
            ) : null}
          </div>

          {showPrompts ? (
            <ResponseRows onAsk={askChip} disabled={!live} />
          ) : null}

          <OrbDock status={status} mode={mode} language={language} />

          <div className="shrink-0 border-t border-rule bg-surface px-3 py-2.5">
            <div className="flex items-center gap-2">
              <form
                onSubmit={onSubmitDraft}
                className="flex min-w-0 flex-1 items-center rounded-pill border border-transparent bg-mist transition-colors duration-150 ease-out focus-within:border-rule-strong"
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask anything"
                  aria-label="Ask anything"
                  enterKeyHint="send"
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-base text-ink outline-none placeholder:text-ink-faint"
                />
                <button
                  type="submit"
                  disabled={!live || draft.trim() === ""}
                  aria-label="Send"
                  className="grid size-11 shrink-0 place-items-center text-ink-muted transition-opacity duration-150 ease-out active:opacity-60 disabled:opacity-30"
                >
                  <IconSend className="size-5" />
                </button>
              </form>
              <button
                type="button"
                onClick={endConversation}
                aria-label="End conversation"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-invert text-ink-invert transition-opacity duration-150 ease-out active:opacity-80"
              >
                <IconClose className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Screen 2 — the reading theatre. The phase auto-advances after ~3s (one
// setTimeout in ConvaiSession); here we only stage the checklist reveal with a
// CSS transition cascade (transition-delay + a single mounted flip — no timers,
// no custom keyframes).
function PreparingView() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-8">
      <div>
        <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
          Marginalia
        </p>
        <h1 className="mt-2 font-display text-2xl tracking-tight text-ink">
          Reading your letter
        </h1>
      </div>

      <ul className="flex flex-col gap-3.5">
        {READING_STEPS.map((step, i) => {
          const last = i === READING_STEPS.length - 1;
          return (
            <li
              key={step}
              style={{ transitionDelay: `${i * 280}ms` }}
              className={`flex items-center gap-3 transition duration-200 ease-out ${
                revealed
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0"
              }`}
            >
              <span
                aria-hidden
                className="grid size-5 shrink-0 place-items-center text-accent"
              >
                {last ? (
                  <IconSpinner className="size-4 animate-spin" />
                ) : (
                  <IconCheck className="size-4" />
                )}
              </span>
              <span className="text-base text-ink-muted">{step}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-start gap-3 rounded-card bg-mist px-4 py-3 shadow-card">
        <IconLock className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <div>
          <p className="font-display text-sm font-medium text-ink">
            Your data is private
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
            We don&apos;t store your letter or your conversation.
          </p>
        </div>
      </div>
    </div>
  );
}

// Screen 3 — the findings card + docked dual CTA. Exhaustive over the union:
// P2 gets its code-line breakdown + the suspected-error proof-mark; P800 gets
// its refund result + the calculation.
function SummaryView({
  letter,
  onChat,
  onType,
}: {
  letter: Letter;
  onChat: () => void;
  onType: () => void;
}) {
  const typeLabel =
    letter.type === "p2" ? "PAYE Coding Notice" : "Tax Calculation";

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-tactile bg-lavender px-2 py-1 font-display text-xs font-medium text-ink-muted">
            <IconCheck className="size-3.5 text-accent" />
            Recognised
          </span>
          <span className="font-display text-xs uppercase tracking-[0.14em] text-ink-faint">
            {typeLabel} · <span className="tnum">{letter.tax_year}</span>
          </span>
        </div>

        <h1 className="mt-4 font-display text-3xl tracking-tight text-ink">
          Here&apos;s what we found
        </h1>
        <p className="mt-1 text-base text-ink-muted">
          For {letter.recipient_name}
        </p>

        {letter.type === "p2" ? (
          <P2Findings letter={letter} />
        ) : (
          <P800Findings letter={letter} />
        )}

        <p className="mt-8 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
          This explains your letter — it is not formal tax advice. Contains
          public sector information licensed under the Open Government Licence
          v3.0.
        </p>
      </div>

      <div className="shrink-0 border-t border-rule bg-surface px-5 py-4">
        <button
          type="button"
          onClick={onChat}
          className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-tactile bg-accent px-5 font-display text-lg font-medium text-ink-invert transition-opacity duration-150 ease-out hover:opacity-90 active:opacity-80"
        >
          <IconMic className="size-5 text-ink-invert" />
          Chat about this letter
        </button>
        <button
          type="button"
          onClick={onType}
          className="mt-2.5 flex min-h-11 w-full items-center justify-center rounded-tactile border border-rule bg-surface px-5 font-display text-base font-medium text-ink shadow-card transition-colors duration-150 ease-out active:bg-surface-sunken"
        >
          Type instead
        </button>
      </div>
    </>
  );
}

function P2Findings({ letter }: { letter: P2Letter }) {
  const topError = letter.suspected_errors[0];
  return (
    <div className="mt-6 flex flex-col gap-5">
      <section>
        <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
          How your tax-free amount is worked out
        </p>
        <dl className="mt-3 flex flex-col gap-2.5">
          {letter.lines.map((line, i) => (
            <div
              key={`${line.label}-${i}`}
              className="border-b border-rule pb-2.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-display text-base font-medium text-ink">
                  {line.label}
                </dt>
                <dd className="tnum shrink-0 text-base text-ink-muted">
                  {poundsSigned(line.amount)}
                </dd>
              </div>
              <p className="mt-1 text-base leading-relaxed text-ink-muted">
                {line.plain_english}
              </p>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 pt-0.5">
            <dt className="font-display text-base font-semibold text-ink">
              Tax-free amount
            </dt>
            <dd className="tnum shrink-0 font-display text-base font-semibold text-ink">
              {pounds(letter.tax_free_amount)} · {letter.current_code}
            </dd>
          </div>
        </dl>
      </section>

      {topError !== undefined ? (
        <section className="rounded-card border-l-2 border-accent bg-accent/10 py-3 pl-3 pr-3">
          <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-accent">
            Worth checking
          </p>
          <p className="mt-1.5 text-base leading-relaxed text-ink">
            {topError.reason}
          </p>
          <p className="mt-2 text-base text-ink">
            You could be overpaying about{" "}
            <span className="tnum font-display font-semibold">
              {pounds(topError.est_annual_overpay)} a year
            </span>{" "}
            (about{" "}
            <span className="tnum">
              {pounds(topError.est_monthly_overpay)} a month
            </span>
            ).
          </p>
        </section>
      ) : null}
    </div>
  );
}

function P800Findings({ letter }: { letter: P800Letter }) {
  const refund = letter.result === "overpaid";
  return (
    <div className="mt-6 flex flex-col gap-5">
      <section className="rounded-card border-l-2 border-accent bg-accent/10 py-3 pl-3 pr-3">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-accent">
          {refund ? "Refund due" : "Amount to pay"}
        </p>
        <p className="tnum mt-1 font-display text-3xl font-semibold text-ink">
          {pounds(letter.amount)}
        </p>
        <p className="mt-1.5 text-base leading-relaxed text-ink-muted">
          {refund
            ? `HMRC took more tax than you owed for ${letter.tax_year}, so you're owed this back.`
            : `You paid less tax than you owed for ${letter.tax_year}.`}
        </p>
      </section>

      <section>
        <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
          The calculation
        </p>
        <dl className="mt-3 flex flex-col gap-2.5 text-base">
          <SummaryRow
            label="Total income"
            value={pounds(letter.total_income)}
          />
          <SummaryRow label="Tax due" value={pounds(letter.tax_due)} />
          <SummaryRow label="Tax paid" value={pounds(letter.tax_paid)} />
        </dl>
      </section>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2.5">
      <dt className="text-ink">{label}</dt>
      <dd className="tnum shrink-0 text-ink-muted">{value}</dd>
    </div>
  );
}

// Screens 6/7 — the transcript as chat bubbles. The audio-paced reveal contract
// is preserved verbatim: only the slice of `live` that has been (or is about to
// be) voiced is shown, with the live caret. User turns get a pale lavender
// treatment, NEVER solid bg-accent (§1.9); the agent gets a mist bubble.
function TranscriptBubbles({
  items,
  live,
  revealedCount,
}: {
  items: Turn[];
  live: string;
  revealedCount: number;
}) {
  const visible = live.slice(0, Math.min(revealedCount, live.length));
  return (
    <div className="flex flex-col gap-3">
      {items.map((turn, i) =>
        turn.role === "system" ? (
          <SystemDivider key={i} text={turn.text} />
        ) : (
          <Bubble key={i} role={turn.role}>
            {turn.text}
          </Bubble>
        ),
      )}
      {visible !== "" ? (
        <Bubble role="agent">
          {visible}
          <span
            aria-hidden
            className="ml-0.5 inline-block w-[0.4ch] animate-pulse bg-accent align-baseline"
            style={{ height: "1em" }}
          />
        </Bubble>
      ) : null}
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "agent";
  children: ReactNode;
}) {
  const base = "max-w-[85%] rounded-bubble px-4 py-3 text-base leading-relaxed";
  return role === "user" ? (
    <p className={`${base} self-end bg-lavender text-ink`}>{children}</p>
  ) : (
    <p className={`${base} self-start bg-mist text-ink`}>{children}</p>
  );
}

// A non-spoken boundary in the thread (the one-time Welsh switch beat, §4.9):
// a centred hairline divider with an uppercase label — editorial, not a bubble.
function SystemDivider({ text }: { text: string }) {
  return (
    <div role="separator" className="my-1 flex items-center gap-3">
      <span aria-hidden className="h-px flex-1 bg-rule" />
      <span className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
        {text}
      </span>
      <span aria-hidden className="h-px flex-1 bg-rule" />
    </div>
  );
}

// Screen 8 — the four canned prompts reshaped from wrap-pills into ≥44px
// full-width list rows. They feed the live session via sendUserMessage (askChip);
// the disabled gate / askChip's !live early-return are kept intact (§5.1).
function ResponseRows({
  onAsk,
  disabled,
}: {
  onAsk: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="shrink-0 border-t border-rule px-4 py-3">
      <p className="mb-2 font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
        Suggested questions
      </p>
      <ul className="flex flex-col gap-2">
        {PROMPT_CHIPS.map((chip) => (
          <li key={chip}>
            <button
              type="button"
              onClick={() => onAsk(chip)}
              disabled={disabled}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-card bg-mist px-3 py-2 text-left text-base text-ink transition duration-150 ease-out hover:shadow-card active:bg-lavender focus-visible:shadow-card disabled:opacity-40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-tactile bg-lavender text-ink"
                >
                  <IconChat className="size-4" />
                </span>
                <span className="min-w-0">{chip}</span>
              </span>
              <IconChevron className="size-4 shrink-0 text-ink-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Screen 5 — the speaking/listening orb. Animated off the SDK `mode` axis (NOT
// `status`, which is `connected` for both, and NOT invented from transcript
// deltas). It must read as a soft, morphing sphere, never a hard pulsing disc.
function OrbDock({
  status,
  mode,
  language,
}: {
  status: string;
  mode: "speaking" | "listening";
  language: Language;
}) {
  const connected = status === "connected";
  const speaking = connected && mode === "speaking";
  // Blue→violet sphere, sanctioned inline hex; the transparent stop sits well
  // inside the box so the rim feathers out instead of cutting to a hard circle.
  const sphere =
    "radial-gradient(circle at 38% 32%, #ffffff 0%, #6e8bf7 24%, #2d51fb 52%, #5b47e0 70%, rgba(235,239,253,0) 92%)";
  // Three offset, blurred layers share this size/opacity treatment; the morph
  // comes from their staggered phase + positions, not a concentric throb.
  const blobState = !connected
    ? "size-12 opacity-40 saturate-50"
    : speaking
      ? "size-[4.5rem] animate-pulse opacity-80 brightness-110"
      : "size-14 animate-pulse opacity-75";
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 px-5 py-4">
      <div className="relative grid size-20 place-items-center">
        <span
          aria-hidden
          style={{
            background: "radial-gradient(circle, #2d51fb 0%, transparent 70%)",
          }}
          className={`absolute rounded-pill blur-2xl transition-all duration-500 ease-out ${
            !connected
              ? "size-16 opacity-20"
              : speaking
                ? "size-24 animate-pulse opacity-70"
                : "size-20 animate-pulse opacity-50"
          }`}
        />
        <span
          aria-hidden
          style={{ background: sphere, animationDelay: "0ms" }}
          className={`absolute -translate-y-2.5 rounded-pill blur-[6px] transition-all duration-500 ease-out ${blobState}`}
        />
        <span
          aria-hidden
          style={{ background: sphere, animationDelay: "1400ms" }}
          className={`absolute -translate-x-2.5 translate-y-1.5 scale-110 rounded-pill blur-[6px] transition-all duration-500 ease-out ${blobState}`}
        />
        <span
          aria-hidden
          style={{ background: sphere, animationDelay: "700ms" }}
          className={`absolute translate-x-2.5 translate-y-1.5 scale-90 rounded-pill blur-[6px] transition-all duration-500 ease-out ${blobState}`}
        />
      </div>
      {connected && !speaking ? (
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              aria-hidden
              style={{ animationDelay: `${i * 100}ms` }}
              className="size-1.5 animate-pulse rounded-pill bg-ink-faint"
            />
          ))}
        </div>
      ) : null}
      <p aria-live="polite" className="font-display text-sm text-ink-muted">
        {voiceStatusLabel(status, mode, language)}
      </p>
    </div>
  );
}

function CitationChips({ sources }: { sources: Source[] }) {
  // The SDK does not expose per-message source_attribution on MessagePayload
  // (verified against @elevenlabs/types). We render citation chips from the
  // letter's own CodeLine → GOV.UK anchors, which is the authoritative mapping
  // of each line to the page that explains it.
  const seen = new Set<string>();
  const unique = sources.filter((s) =>
    seen.has(s.anchor) ? false : (seen.add(s.anchor), true),
  );
  return (
    <div className="mt-5 border-t border-rule pt-4">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
        Official guidance
      </p>
      <div className="mt-2.5 flex flex-col gap-2">
        {unique.map((s) => (
          <a
            key={s.anchor}
            href={`https://www.gov.uk/${s.anchor}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-between gap-3 rounded-tactile bg-mist px-3.5 text-base text-ink-muted transition-colors duration-150 ease-out hover:text-accent active:bg-surface-sunken"
          >
            <span>GOV.UK — {s.label}</span>
            <IconExternal className="size-4 shrink-0 text-ink-faint" />
          </a>
        ))}
      </div>
    </div>
  );
}

// Screen 9 — the one real P2 action, gated exactly as before
// (suspectedErrors.length > 0 && agentHasReplied). Same-window Link into the
// GOV.UK form — this IS the finish-flow entry (leaving unmounts the session,
// which is correct). No invented amounts/deadlines: only the audited £/yr · £/mo.
function ActionCard({
  error,
  letterId,
}: {
  error: SuspectedError;
  letterId: string;
}) {
  return (
    <div className="mt-5 border-t border-rule-strong pt-5">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
        What you need to do
      </p>
      <div className="mt-3 rounded-card bg-mist p-4 shadow-card">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
          {error.line_label}
        </h2>
        <p className="mt-1.5 text-base leading-relaxed text-ink-muted">
          {error.reason}
        </p>
        <p className="mt-3 text-base text-ink">
          Fixing this could save you about{" "}
          <span className="tnum font-display font-semibold">
            {pounds(error.est_annual_overpay)} a year
          </span>{" "}
          (about{" "}
          <span className="tnum">
            {pounds(error.est_monthly_overpay)} a month
          </span>
          ).
        </p>
        <Link
          href={`/actions/update-company-car/${letterId}`}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-tactile bg-accent px-4 font-display text-base font-medium text-ink-invert transition-opacity duration-150 ease-out hover:opacity-90 active:opacity-80"
        >
          Fix this on the government portal
          <IconArrow className="size-4" />
        </Link>
      </div>
    </div>
  );
}

async function fetchSignedUrl(): Promise<string> {
  const res = await fetch("/api/eleven/signed-url");
  if (!res.ok)
    throw new Error("Could not start the conversation. Please try again.");
  const data: unknown = await res.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("signedUrl" in data) ||
    typeof (data as { signedUrl: unknown }).signedUrl !== "string"
  ) {
    throw new Error("Could not start the conversation. Please try again.");
  }
  return (data as { signedUrl: string }).signedUrl;
}

// The client tool's parameters arrive as an untyped record; read the target
// without widening our own types to any.
function readTarget(parameters: Record<string, unknown>): string | null {
  const target = parameters["target"];
  return typeof target === "string" ? target : null;
}

// The agent should pass "cy", but accept the language's other spellings so an
// off-script value from the model still triggers the Welsh beat.
function targetIsWelsh(target: string | null): boolean {
  if (target === null) return false;
  const t = target.trim().toLowerCase();
  return t.startsWith("cy") || t.includes("welsh") || t.includes("cymraeg");
}

function voiceStatusLabel(
  status: string,
  mode: "speaking" | "listening",
  language: Language,
): string {
  if (status === "connecting") return "Connecting…";
  if (status === "error") return "Connection error";
  if (status !== "connected") return "Not connected";
  const cy = language === "cy" ? " · Cymraeg" : "";
  return (mode === "speaking" ? "Marginalia is speaking" : "Listening") + cy;
}

function messageOf(e: unknown): string {
  if (e instanceof DOMException && e.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow the microphone and try again.";
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong starting the conversation.";
}

type IconProps = { className?: string };

function IconCheck({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

function IconChevron({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 3.5 5 4.5-5 4.5" />
    </svg>
  );
}

function IconChat({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v4A1.5 1.5 0 0 1 11.5 10H6l-3 2.5V4.5Z" />
    </svg>
  );
}

function IconArrow({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function IconClose({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

function IconSend({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13V3M4 7l4-4 4 4" />
    </svg>
  );
}

function IconMic({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M4 7.5a4 4 0 0 0 8 0M8 11.5V14M6 14h4" />
    </svg>
  );
}

function IconExternal({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3h4v4M13 3 7 9M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" />
    </svg>
  );
}

function IconLock({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function IconSpinner({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    >
      <path d="M8 2a6 6 0 1 1-6 6" />
    </svg>
  );
}
