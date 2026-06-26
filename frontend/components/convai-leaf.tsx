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
import { BackButton } from "@/components/back-button";
import { GovukEmbed } from "@/components/govuk-embed";
import { pounds } from "@/lib/letter-format";

// "system" is a non-spoken boundary marker (e.g. the one-time Welsh switch beat),
// rendered as a centred divider rather than a bubble — it is not a conversation turn.
type Turn = { role: "user" | "agent" | "system"; text: string };
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

// The leaf takes the typed Letter, the persona/rules system prompt, and the two
// letter-data blocks built server-side. sources / suspected errors / id are
// derived from the letter here rather than drilled as separate props — one source
// of truth, exhaustive over the union.
type LeafProps = {
  letter: Letter;
  systemPrompt: string;
  letterBlock: string;
  letterBlockWelsh: string;
};

const PROMPT_CHIPS = [
  "What does my tax code mean?",
  "Why did it change?",
  "Is this correct?",
  "What do I need to do?",
];

// The reliable trigger: the agent is prompted to tell the user to "tap the 'Fix
// this on the government portal' button" when they ask what to do, so the card
// surfaces exactly when the agent's own reply references that action. Matching
// the AGENT (not a brittle substring of the USER's phrasing) is what makes
// off-script asks like "what should I kind of do about this?" still work.
const ACTION_REPLY_PATTERN =
  /government portal|personal tax account|fix this|update your company car|tap the .* button/i;

// A secondary fallback on the USER's intent — broadened so common "what do I do
// about this?" phrasings still surface the card even if the agent's wording
// drifts off the prompt. The agent-reply trigger above is the authoritative one.
const ACTION_TRIGGERS = [
  "what do i need to do",
  "what should i do",
  "what do i do",
  "do about this",
  "what to do",
  "how do i fix",
  "fix this",
  "sort this",
  "give me the link",
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
  "Helo, fy enw i yw Marginalia. Beth hoffech chi ei wybod am eich llythyr?";
const ENGLISH_FIRST_MESSAGE =
  "Hi, I'm Marginalia. What would you like to know about your letter?";

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

function ConvaiSession({
  letter,
  systemPrompt,
  letterBlock,
  letterBlockWelsh,
}: LeafProps) {
  const [phase, setPhase] = useState<Phase>("preparing");
  // How the conversation was entered (set in beginConversation): "voice" via
  // "Chat about this letter", "text" via "Type instead". The mock shows the
  // central voice orb only in the voice frames (4-6); the typed-chat frames
  // (7-9) run a clean thread with no orb. This gates the prominent OrbDock vs.
  // a slim status line so the typed path matches the mock.
  const [entryMode, setEntryMode] = useState<"voice" | "text">("voice");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [agentLive, setAgentLive] = useState("");
  const [revealedCount, setRevealedCount] = useState(0);
  const [language, setLanguage] = useState<Language>("en");
  const [error, setError] = useState<string | null>(null);
  const [agentHasReplied, setAgentHasReplied] = useState(false);
  const [agentThinking, setAgentThinking] = useState(false);
  const [draft, setDraft] = useState("");
  // The GOV.UK action is an in-session overlay, not a route. Opening it ends the
  // voice session (openGovukAction), so closing returns to the letter summary —
  // not a dead transcript whose composer would queue questions into an ended
  // session that never reconnects.
  const [actionOverlayOpen, setActionOverlayOpen] = useState(false);

  // Absolute spoken-at timestamps per char of the *current* agent response.
  // A ref (not state) because the reveal interval mutates it on every audio
  // chunk and reads it every ~30ms without needing to re-render the tree.
  const timeline = useRef<RevealTimeline>({ spokenAtMs: [] });
  // The transcript scroll region + the typed-input element; refs so we can
  // auto-scroll to the latest turn and focus the input on "Type instead".
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInputOnEnter = useRef(false);
  // Autoscroll state, in refs so updating it never re-renders. `stickToBottom`
  // is whether we should keep pinning to the foot as content grows; the onScroll
  // handler flips it off the moment the reader scrolls up to re-read, and back on
  // when they return to the bottom. `prevTurnCount` lets the scroll effect tell a
  // brand-new turn (always re-pin) from mere streaming growth (pin only if stuck).
  const stickToBottom = useRef(true);
  const prevTurnCount = useRef(0);
  // Questions submitted (typed or tapped) before the socket is open can't be sent
  // yet — sendUserMessage throws until status is "connected". Hold them here and
  // flush on connect so a question entered during the ~1-2s start handshake still
  // reaches the agent instead of being silently dropped (§Task A root cause).
  const pendingMessages = useRef<string[]>([]);

  // Derived from the typed letter, exhaustive over the P2 | P800 union — P800
  // has no suspected errors, so the action card simply never shows for it.
  const letterId = letter.id;
  const suspectedErrors: SuspectedError[] =
    letter.type === "p2" ? letter.suspected_errors : [];

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
          // Dedup guard: drop an agent turn identical to the one immediately
          // before it. The opening line arrives via the firstMessage override;
          // an echoed/repeated emission of the same text (the triple-greeting
          // bug) must not stack a second bubble on top of it.
          setTranscript((t) => {
            const last = t[t.length - 1];
            if (last?.role === "agent" && last.text === m.message) return t;
            return [...t, { role: "agent", text: m.message }];
          });
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
          setAgentThinking(true);
        } else if (part.type === "delta") {
          setAgentLive((s) => s + part.text);
        } else if (part.type === "stop") {
          setAgentLive("");
          setRevealedCount(0);
          timeline.current = { spokenAtMs: [] };
          setAgentThinking(false);
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
          setAgentThinking(false);
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

  // Flush any questions queued before the socket opened (§Task A). Runs the moment
  // the session reaches "connected" — including the Welsh restart's reconnect — so
  // a too-early submit is delivered rather than dropped. sendUserMessage is a
  // stable SDK ref, so this only re-runs on an actual status change.
  useEffect(() => {
    if (status !== "connected" || pendingMessages.current.length === 0) return;
    const queued = pendingMessages.current;
    pendingMessages.current = [];
    for (const text of queued) sendUserMessage(text);
  }, [status, sendUserMessage]);

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

  // Keep the foot of the thread in view as turns arrive AND as the agent's reply
  // streams in (revealedCount grows on every reveal tick) — a brand-new turn
  // always re-pins, ongoing growth pins only while the reader hasn't scrolled up.
  // This is what stops a long reply from "getting stuck" once it passes the fold.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const newTurn = transcript.length > prevTurnCount.current;
    prevTurnCount.current = transcript.length;
    if (newTurn) stickToBottom.current = true;
    if (newTurn || stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [transcript, revealedCount, agentThinking, phase]);

  // Track whether the reader is parked at the bottom. Scrolling up to re-read
  // turns auto-stick off; returning to the foot turns it back on. Mutates a ref
  // only, so it never triggers a render on a hot scroll event.
  function onTranscriptScroll() {
    const el = scrollRef.current;
    if (el === null) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

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
            // The override REPLACES the agent's base prompt for this session, so
            // the persona + concision rules must travel with the letter data or
            // they never apply at runtime (§Task B). System prompt first, then
            // the letter block as the data the rules operate on.
            prompt: { prompt: `${systemPrompt}\n\n${letterBlock}` },
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
            // Same persona + concision rules as English (they are language-
            // agnostic); only the letter data is translated. Without this the
            // Welsh session would inherit no rules and ramble (§Task B).
            prompt: { prompt: `${systemPrompt}\n\n${letterBlockWelsh}` },
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
    setEntryMode(focusInput ? "text" : "voice");
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

  // The GOV.UK overlay is a pure in-session layer over the live chat: the
  // provider AND the session stay alive, so closing it ("Back to chat") returns
  // to the exact conversation — same transcript, still connected to continue.
  function openGovukAction() {
    setActionOverlayOpen(true);
  }

  // Send a question through the shared session, or queue it when the socket isn't
  // open yet — the flush effect (above) delivers it on connect. The optimistic
  // user turn shows immediately so the question registers on submit for the demo.
  // sendUserMessage injects text (not transcribed speech), so the server does not
  // echo it back as a user_transcript onMessage event; if a future SDK starts
  // echoing, dedupe here on the trailing user turn.
  function ask(text: string) {
    setTranscript((t) => [...t, { role: "user", text }]);
    if (status === "connected") {
      sendUserMessage(text);
    } else {
      pendingMessages.current.push(text);
    }
  }

  function onSubmitDraft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = draft.trim();
    if (text === "") return;
    ask(text);
    setDraft("");
  }

  const hasUserTurn = transcript.some((t) => t.role === "user");
  const showPrompts = live && !hasUserTurn;
  // The action card surfaces when the AGENT's reply points the user at the
  // GOV.UK action — the prompt tells it to say "tap the 'Fix this on the
  // government portal' button", so this fires exactly when the agent claims the
  // card is there. A broadened user-intent match is kept as a fallback.
  const agentReferencedAction = transcript.some(
    (t) => t.role === "agent" && ACTION_REPLY_PATTERN.test(t.text),
  );
  const askedWhatToDo = transcript.some(
    (t) =>
      t.role === "user" &&
      ACTION_TRIGGERS.some((phrase) => t.text.toLowerCase().includes(phrase)),
  );
  // Gate on a real suspected error and on the agent having replied, so it never
  // appears after the bare opening greeting.
  const showActionCard =
    suspectedErrors.length > 0 &&
    agentHasReplied &&
    (agentReferencedAction || askedWhatToDo);
  const topError = suspectedErrors[0];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
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
          <ConversationHeader language={language} />
          <div
            ref={scrollRef}
            onScroll={onTranscriptScroll}
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
              thinking={agentThinking}
            />

            {showActionCard && topError !== undefined ? (
              <ActionCard error={topError} onOpen={openGovukAction} />
            ) : null}
          </div>

          {showPrompts ? <ResponseRows onAsk={ask} disabled={!live} /> : null}

          {/* Voice entry keeps the prominent orb (mock frames 4-6); the typed
              path drops it for a slim status line so the thread reads clean to
              the input bar (mock frames 7-9). Voice stays live either way. */}
          {entryMode === "voice" ? (
            <OrbDock status={status} mode={mode} language={language} />
          ) : (
            <VoiceStatusLine status={status} mode={mode} language={language} />
          )}

          <div className="shrink-0 border-t border-rule bg-surface px-3 py-2.5">
            <div className="flex items-center gap-2">
              <form
                onSubmit={onSubmitDraft}
                className="flex min-w-0 flex-1 items-center gap-1 rounded-pill border border-transparent bg-mist pl-2 pr-1 transition-colors duration-150 ease-out focus-within:border-rule-strong"
              >
                {/* Decorative "+" affordance (reference Screens 4-9). There is no
                    attachment flow in the demo, so it carries no handler — it is
                    purely the mock's leading glyph. */}
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center text-ink-faint"
                >
                  <IconPlus className="size-5" />
                </span>
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask anything"
                  aria-label="Ask anything"
                  enterKeyHint="send"
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
                />
                <button
                  type="submit"
                  // Disabled only when empty — NOT on !live. A disabled submit
                  // button suppresses the form's implicit Enter submission, which
                  // would drop a question typed during the start handshake; `ask`
                  // queues it instead and the flush effect delivers it on connect.
                  // The glyph tracks draft state: a mic at rest (voice is always
                  // live) that becomes a send arrow once there is text to send.
                  disabled={draft.trim() === ""}
                  aria-label={draft.trim() === "" ? "Voice input" : "Send"}
                  className="grid size-9 shrink-0 place-items-center rounded-pill transition-opacity duration-150 ease-out active:opacity-60"
                >
                  {draft.trim() === "" ? (
                    <IconMic className="size-5 text-ink-muted" />
                  ) : (
                    <IconSend className="size-5 text-accent" />
                  )}
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

          {actionOverlayOpen ? (
            <GovukEmbed
              letterId={letterId}
              recipientName={
                letter.type === "p2" ? letter.recipient_name : "the taxpayer"
              }
              onClose={() => setActionOverlayOpen(false)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

// Screen 4 header — a hamburger menu on the left, a language selector on the
// right. The menu opens the home route; the language selector reflects the
// active language and is the same axis the agent switches on via `switch_language`.
function ConversationHeader({ language }: { language: Language }) {
  return (
    <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
      <Link
        href="/"
        aria-label="Menu"
        className="grid size-10 place-items-center text-ink-muted transition-opacity duration-150 ease-out active:opacity-60"
      >
        <IconMenu className="size-5" />
      </Link>
      <span className="flex items-center gap-1 font-display text-sm text-ink-muted">
        {language === "cy" ? "Cymraeg" : "English"}
        <IconChevron className="size-3.5 rotate-90" />
      </span>
    </div>
  );
}

// Screen 2 — the reading theatre. The phase auto-advances after ~3s (one
// setTimeout in ConvaiSession); here we only stage the orb + checklist reveal
// with a CSS transition cascade (transition-delay + a single mounted flip — no
// timers, no custom keyframes). The orb is the same morphing sphere used in the
// live chat (OrbSphere), shown in its "connected / listening" idle state so the
// loading screen reads as the same entity that answers back.
function PreparingView() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      {/* Back to home from the reading theatre. -ml-2.5 aligns the chevron ink
          with the px-6 content edge below. */}
      <div className="-ml-2.5">
        <BackButton href="/" />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="flex flex-col items-center gap-6">
          <OrbSphere connected speaking={false} />
          <h1 className="font-display text-2xl tracking-tight text-ink">
            Reading your letter…
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
      </div>

      {/* Privacy reassurance (reference Screen 2): a calm mist card pinned at
          the foot of the reading theatre — the promise the home screen repeats. */}
      <div className="mt-6 flex items-center gap-3 rounded-card bg-mist px-4 py-3.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-pill bg-surface text-accent"
        >
          <IconLock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-ink">
            Your data is private
          </p>
          <p className="text-sm leading-snug text-ink-muted">
            We don&apos;t share your letter or conversations
          </p>
        </div>
      </div>
    </div>
  );
}

// Screen 3 — the recognised-document card + findings + docked dual CTA, after
// reference frame 3. A thin top bar carries only Back + the language globe (no
// title); the letter is named in its own mist card below; the findings are a
// clean list of icon + plain-English rows, not tinted breakdown slabs.
// Exhaustive over the union: P2 derives its rows from the code lines + the
// suspected error, P800 from its result + refund/owed amount.
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
  // Short tax-year form (e.g. "2026 to 2027") so the card's second line stays a
  // single row — the reference uses the same compact span.
  const period = letter.tax_year;

  return (
    <>
      {/* Thin top bar (reference frame 3): a back chevron to home on the left
          and the language globe on the right — no title sits in this row. */}
      <div className="flex shrink-0 items-center justify-between border-b border-rule bg-surface px-2 py-2.5">
        <Link
          href="/"
          aria-label="Back"
          className="grid size-10 place-items-center text-ink-muted transition-opacity duration-150 ease-out active:opacity-60"
        >
          <IconChevron className="size-5 rotate-180" />
        </Link>
        <span
          aria-hidden
          className="grid size-10 place-items-center text-ink-muted"
        >
          <IconGlobe className="size-5" />
        </span>
      </div>

      {/* White canvas so the mist document card reads as distinct, matching
          reference frame 3. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface px-5 py-5">
        {/* Recognised-document card: the letter named once — doc glyph, title +
            period stacked, and the Recognised badge below. */}
        <div className="flex items-start gap-3 rounded-card bg-mist p-4">
          <span aria-hidden className="mt-0.5 shrink-0 text-ink-muted">
            <IconDoc className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold text-ink">
              {typeLabel}
            </p>
            <p className="tnum mt-0.5 text-sm text-ink-muted">{period}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-lavender px-2.5 py-1 font-display text-xs font-medium text-navy">
              <IconCheck className="size-3 text-accent" />
              Recognised
            </span>
          </div>
        </div>

        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-ink">
          Here&apos;s what we found.
        </h1>
        <p className="mt-2 text-base leading-relaxed text-ink">
          {letter.type === "p2"
            ? `This sets the tax code your employer will use for the ${letter.tax_year} tax year.`
            : `This shows how much tax you paid in the ${letter.tax_year} tax year.`}
        </p>

        {letter.type === "p2" ? (
          <P2Findings letter={letter} />
        ) : (
          <P800Findings letter={letter} />
        )}
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
        {/* Bordered white button with blue icon + dark blue text — the
            reference's "Type instead" treatment. */}
        <button
          type="button"
          onClick={onType}
          className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-tactile border border-rule bg-surface px-5 font-display text-base font-medium text-ink transition-colors duration-150 ease-out active:bg-surface-sunken"
        >
          <IconKeyboard className="size-4 text-accent" />
          Type instead
        </button>
      </div>
    </>
  );
}

// One key finding: a small lavender icon tile + a plain-English sentence (figures
// inline), after reference frame 3. "pound" leads a row that states a figure;
// "note" leads a heads-up or context row.
type FindingRow = { icon: "pound" | "note"; text: string };

function FindingsList({ rows }: { rows: FindingRow[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {rows.map((row, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-tactile bg-lavender text-accent"
          >
            {row.icon === "note" ? (
              <IconInfo className="size-4" />
            ) : (
              <IconPound className="size-4" />
            )}
          </span>
          <p className="flex-1 text-base leading-relaxed text-ink-muted">
            {row.text}
          </p>
        </li>
      ))}
    </ul>
  );
}

// Three rows derived from the real P2 data: the tax-free amount + code, the
// company-car deduction that lowers it, and the audited overpayment worth
// checking. Figures come straight from the letter — never recomputed.
function P2Findings({ letter }: { letter: P2Letter }) {
  const deduction = letter.lines.find((l) => l.amount < 0);
  const topError = letter.suspected_errors[0];

  const rows: FindingRow[] = [
    {
      icon: "pound",
      text: `Your tax-free amount this year is ${pounds(letter.tax_free_amount)}, which sets your tax code to ${letter.current_code}.`,
    },
  ];
  if (deduction !== undefined) {
    rows.push({
      icon: "pound",
      text: `HMRC believes you have a company car, which lowers that amount by ${pounds(deduction.amount)}.`,
    });
  }
  if (topError !== undefined) {
    rows.push({
      icon: "note",
      text: `Worth checking: you may be overpaying about ${pounds(topError.est_annual_overpay)} a year, because you told us you no longer have this company car.`,
    });
  }

  return <FindingsList rows={rows} />;
}

// Three rows from the real P800 data: the over/under-payment, the resulting
// refund or amount owed, and the everyday reason it happens.
function P800Findings({ letter }: { letter: P800Letter }) {
  const refund = letter.result === "overpaid";
  const rows: FindingRow[] = [
    {
      icon: "note",
      text: refund
        ? `You paid more tax than you needed to in ${letter.tax_year}.`
        : `You paid less tax than you owed in ${letter.tax_year}.`,
    },
    {
      icon: "pound",
      text: refund
        ? `That's why you're owed a refund of ${pounds(letter.amount)}.`
        : `That's why you still owe ${pounds(letter.amount)}.`,
    },
    {
      icon: "note",
      text: refund
        ? "This usually happens when too much tax was taken from your pay."
        : "This usually happens when not enough tax was taken from your pay.",
    },
  ];

  return <FindingsList rows={rows} />;
}

// Screens 6/7 — the transcript as chat bubbles. The audio-paced reveal contract
// is preserved verbatim: only the slice of `live` that has been (or is about to
// be) voiced is shown, with the live caret. User turns get a pale lavender
// treatment, NEVER solid bg-accent (§1.9); the agent gets a mist bubble.
function TranscriptBubbles({
  items,
  live,
  revealedCount,
  thinking,
}: {
  items: Turn[];
  live: string;
  revealedCount: number;
  thinking: boolean;
}) {
  const visible = live.slice(0, Math.min(revealedCount, live.length));
  // Show the typing indicator only while the agent is thinking AND no audio-
  // aligned text has appeared yet — once the first character is revealed, the
  // live bubble takes over and the dots disappear.
  const showTyping = thinking && visible === "";
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
      {showTyping ? <TypingBubble /> : null}
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

// The pre-dictation placeholder: three pulsing dots in a mist bubble, shown
// between the agent receiving the question and the first audio-aligned word.
function TypingBubble() {
  return (
    <p
      aria-label="Marginalia is thinking"
      className="max-w-[85%] self-start rounded-bubble bg-mist px-4 py-3.5 text-base leading-relaxed"
    >
      <span className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            style={{ animationDelay: `${i * 160}ms` }}
            className="size-2 animate-pulse rounded-pill bg-ink-faint"
          />
        ))}
      </span>
    </p>
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
// full-width list rows. They feed the session through `ask`, which sends now or
// queues until connect; the disabled gate only reflects whether the session is
// live (§5.1).
function ResponseRows({
  onAsk,
  disabled,
}: {
  onAsk: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="shrink-0 border-t border-rule px-4 py-3">
      <p className="mb-2.5 px-1 font-display text-sm font-medium text-ink-muted">
        Suggested questions
      </p>
      <ul className="flex flex-col gap-2">
        {PROMPT_CHIPS.map((chip) => (
          <li key={chip}>
            <button
              type="button"
              onClick={() => onAsk(chip)}
              disabled={disabled}
              className="flex min-h-[3.25rem] w-full items-center justify-between gap-3 rounded-card border border-transparent bg-mist px-3 py-2.5 text-left text-base text-ink transition-colors duration-150 ease-out active:bg-lavender focus-visible:border-accent disabled:opacity-40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-tactile bg-lavender text-accent"
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
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 px-5 py-4">
      <OrbSphere connected={connected} speaking={speaking} />
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

// The typed-chat stand-in for OrbDock (mock frames 7-9): no central sphere or
// dots, just a slim status caption above the input so the thread reads clean.
// Voice is still live in this mode, so it keeps OrbDock's exact aria-live +
// voiceStatusLabel contract — "Marginalia is speaking" still announces when the
// agent voices a reply.
function VoiceStatusLine({
  status,
  mode,
  language,
}: {
  status: string;
  mode: "speaking" | "listening";
  language: Language;
}) {
  return (
    <p
      aria-live="polite"
      className="shrink-0 px-4 pb-1.5 text-center font-display text-xs text-ink-faint"
    >
      {voiceStatusLabel(status, mode, language)}
    </p>
  );
}

// The morphing sphere itself — shared by the live chat (OrbDock) and the
// reading theatre (PreparingView) so the loading screen reads as the same
// entity that answers back. Three offset, blurred layers share a size/opacity
// treatment; the morph comes from their staggered phase + positions, not a
// concentric throb. `connected` decides whether the sphere is dimmed (idle) or
// luminous; `speaking` pushes it larger and brighter.
function OrbSphere({
  connected,
  speaking,
}: {
  connected: boolean;
  speaking: boolean;
}) {
  // Blue→violet sphere, sanctioned inline hex; the transparent stop sits well
  // inside the box so the rim feathers out instead of cutting to a hard circle.
  const sphere =
    "radial-gradient(circle at 38% 32%, #ffffff 0%, #6e8bf7 24%, #2d51fb 52%, #5b47e0 70%, rgba(235,239,253,0) 92%)";
  const blobState = !connected
    ? "size-12 opacity-40 saturate-50"
    : speaking
      ? "size-[4.5rem] animate-pulse opacity-80 brightness-110"
      : "size-14 animate-pulse opacity-75";
  return (
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
  );
}

// Screen 9 — the one real P2 action, surfaced after the user asks "what do I
// need to do" and the agent has answered that turn. The button opens the GOV.UK
// view as an in-session overlay (onOpen) rather than navigating away, so the live
// session and transcript survive a close (§Task D). No invented amounts/deadlines:
// only the audited £/yr · £/mo.
function ActionCard({
  error,
  onOpen,
}: {
  error: SuspectedError;
  onOpen: () => void;
}) {
  return (
    <div className="mt-6">
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
        What you need to do
      </h2>
      <p className="mt-1.5 text-base leading-relaxed text-ink-muted">
        Based on your letter, this is the one thing worth checking.
      </p>
      {/* A single truthful action row (leading icon tile + the audited figures),
          then the GOV.UK hand-off. The button OPENS THE IN-SESSION OVERLAY via
          onOpen — it must never navigate away (§Task D). */}
      <div className="mt-4 rounded-card border border-rule bg-surface p-4 shadow-card">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-tactile bg-lavender text-accent"
          >
            <IconPound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              {error.line_label}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {error.reason}
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-ink">
              Fixing this could save about{" "}
              <span className="tnum font-display font-semibold">
                {pounds(error.est_annual_overpay)} a year
              </span>{" "}
              (about{" "}
              <span className="tnum">
                {pounds(error.est_monthly_overpay)} a month
              </span>
              ).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-tactile bg-accent px-4 font-display text-base font-medium text-ink-invert transition-opacity duration-150 ease-out hover:opacity-90 active:opacity-80"
        >
          Fix this on the government portal
          <IconArrow className="size-4" />
        </button>
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

// Document-with-magnifier, after the reference Screen 3 doc-id card.
function IconDoc({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className ?? "size-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <circle cx="11" cy="14" r="2.25" />
      <path d="m12.6 15.6 1.4 1.4" />
    </svg>
  );
}

// Pound-in-circle for code-line rows.
function IconPound({ className }: IconProps) {
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
      <circle cx="8" cy="8" r="6" />
      <path d="M9.5 5.2C9 4.9 8.5 4.8 8 4.8c-1.1 0-1.7.7-1.7 1.7 0 .8.3 1.3.8 1.9l1 1.1c.4.5.6.9.6 1.5 0 .9-.5 1.6-1.4 1.6-.4 0-.8-.1-1.1-.4M6 8.3h3.2" />
    </svg>
  );
}

// Info "i" in a circle — the "worth checking" / context findings rows.
function IconInfo({ className }: IconProps) {
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
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.3v3.3" />
      <path d="M8 5.2h.01" />
    </svg>
  );
}

// Keyboard for the "Type instead" text link.
function IconKeyboard({ className }: IconProps) {
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
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 9h8" />
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

function IconMenu({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className ?? "size-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    >
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
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

// "+" affordance at the head of the input capsule.
function IconPlus({ className }: IconProps) {
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
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

// Globe for the summary header's language affordance.
function IconGlobe({ className }: IconProps) {
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
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.6 2.7 3.7 2.7 6S9.7 12.4 8 14C6.3 12.4 5.3 10.3 5.3 8S6.3 3.6 8 2Z" />
    </svg>
  );
}

// Padlock for the "Your data is private" reassurance card.
function IconLock({ className }: IconProps) {
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
      <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  );
}
