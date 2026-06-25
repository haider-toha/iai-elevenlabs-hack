"use client";

import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { SuspectedError } from "@/lib/api";
import { env } from "@/lib/env";

type Turn = { role: "user" | "agent"; text: string };
type Source = { label: string; anchor: string };
type Language = "en" | "cy";

// The agent triggers `switch_language` (registered server-side, param `target`)
// when the user asks for Welsh. The wire passes parameters as an untyped record,
// so the handler narrows `target` itself rather than widening our types to any.
type ConvaiTools = {
  switch_language: (params: Record<string, unknown>) => void;
};

type LeafProps = {
  letterBlock: string;
  letterBlockWelsh: string;
  suspectedErrors: SuspectedError[];
  sources: Source[];
  letterId: string;
};

const PROMPT_CHIPS = [
  "What does my tax code mean?",
  "Why did it change?",
  "Is this correct?",
  "What do I need to do?",
];

const WELSH_FIRST_MESSAGE =
  "Helo, gallaf weld bod gennych hysbysiad cod treth gan CThEM. Beth hoffech chi ei wybod?";
const ENGLISH_FIRST_MESSAGE =
  "Hi, I can see you've got a tax code notice from HMRC. What would you like to know?";

// One audio chunk's worth of character timings, plus the wall-clock moment it
// arrived. The karaoke highlight compares elapsed time against these to advance
// a "spoken" cursor through the live caption.
type AlignmentSegment = {
  chars: string[];
  charStartTimesMs: number[];
  charDurationsMs: number[];
  receivedAt: number;
};

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
  letterBlock,
  letterBlockWelsh,
  suspectedErrors,
  sources,
  letterId,
}: LeafProps) {
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [agentLive, setAgentLive] = useState("");
  const [spokenCount, setSpokenCount] = useState(0);
  const [language, setLanguage] = useState<Language>("en");
  const [error, setError] = useState<string | null>(null);
  const [agentHasReplied, setAgentHasReplied] = useState(false);

  // The latest audio chunk's alignment and its arrival time. A ref (not state)
  // because the highlight interval reads it every ~50ms without re-rendering.
  const alignment = useRef<AlignmentSegment | null>(null);

  // v1.8.0's convenience hook: it both reads status / exposes the session
  // controls AND registers these callbacks with the provider via a latest-
  // closure ref, so the handlers always see the current state setters.
  const { status, startSession, endSession, sendUserMessage } = useConversation({
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
      // part: { text, type: "start" | "delta" | "stop", event_id }
      if (part.type === "start") {
        setAgentLive("");
        setSpokenCount(0);
      } else if (part.type === "delta") {
        setAgentLive((s) => s + part.text);
      } else if (part.type === "stop") {
        setAgentLive("");
        setSpokenCount(0);
      }
    },
    onAudioAlignment: (a) => {
      // Field names are snake_case on the wire (AudioEventAlignment).
      alignment.current = {
        chars: a.chars,
        charStartTimesMs: a.char_start_times_ms,
        charDurationsMs: a.char_durations_ms,
        receivedAt: performance.now(),
      };
    },
    // onError(message, context) — the first arg is the message string, not an
    // Error object. Surface it inline rather than logging to a console nobody
    // watches during a demo.
    onError: (message) => setError(message),
    onStatusChange: ({ status }) => {
      if (status === "disconnected") {
        setAgentLive("");
        setSpokenCount(0);
      }
    },
  });
  const live = status === "connected" || status === "connecting";

  // Karaoke highlight: every ~50ms, find how many characters of the current
  // audio chunk have elapsed and reflect that as the spoken-prefix length of
  // the live caption.
  useEffect(() => {
    if (status !== "connected") return;
    const tick = window.setInterval(() => {
      const seg = alignment.current;
      if (seg === null || seg.chars.length === 0) return;
      const elapsed = performance.now() - seg.receivedAt;
      let spoken = 0;
      for (let i = 0; i < seg.chars.length; i++) {
        const start = seg.charStartTimesMs[i] ?? 0;
        const dur = seg.charDurationsMs[i] ?? 0;
        if (elapsed >= start + dur) spoken = i + 1;
        else break;
      }
      setSpokenCount(spoken);
    }, 50);
    return () => window.clearInterval(tick);
  }, [status]);

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
    if (readTarget(params) === "cy") void restartInWelsh();
  });

  function onPrimaryTap() {
    if (live) endSession();
    else void startInEnglish();
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

  const showActionChip = suspectedErrors.length > 0 && agentHasReplied;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrimaryTap}
          aria-pressed={live}
          className={`rounded-tactile px-5 py-3 font-display text-lg font-medium transition-opacity duration-150 ease-out hover:opacity-90 ${
            live
              ? "border border-rule-strong bg-surface-sunken text-ink"
              : "bg-accent text-ink-invert"
          }`}
        >
          {live ? "End conversation" : "Ask about this letter"}
        </button>

        <span className="flex items-center gap-2 font-display text-sm text-ink-muted">
          <span
            aria-hidden
            className="size-2 rounded-tactile"
            style={{
              backgroundColor:
                status === "connected"
                  ? "var(--color-positive)"
                  : status === "connecting"
                    ? "var(--color-warning)"
                    : "var(--color-ink-faint)",
            }}
          />
          {statusLabel(status, language)}
        </span>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-tactile border-l-2 border-accent bg-accent/10 py-2 pl-3 pr-2 text-base text-ink"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {PROMPT_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => askChip(chip)}
            disabled={!live}
            className="rounded-tactile border border-rule px-3 py-1.5 text-base text-ink transition-opacity duration-150 ease-out hover:border-rule-strong disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
      </div>

      <TranscriptPanel
        items={transcript}
        live={agentLive}
        spokenCount={spokenCount}
      />

      {agentHasReplied && sources.length > 0 ? (
        <CitationChips sources={sources} />
      ) : null}

      {showActionChip ? (
        <Link
          href={`/actions/update-company-car/${letterId}`}
          className="inline-flex w-fit items-center gap-2 rounded-tactile bg-accent px-4 py-2.5 font-display text-base font-medium text-ink-invert transition-opacity duration-150 ease-out hover:opacity-90"
        >
          Fix this in your tax account
          <span aria-hidden>&rarr;</span>
        </Link>
      ) : null}
    </section>
  );
}

function TranscriptPanel({
  items,
  live,
  spokenCount,
}: {
  items: Turn[];
  live: string;
  spokenCount: number;
}) {
  const empty = items.length === 0 && live === "";
  return (
    <div className="min-h-40 border-t border-rule-strong pt-4">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
        Transcript
      </p>
      {empty ? (
        <p className="mt-4 max-w-[48ch] text-base text-ink-faint">
          Tap “Ask about this letter” and speak, or pick a question above. The
          conversation appears here as it happens.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {items.map((turn, i) => (
            <p
              key={i}
              className={
                turn.role === "user"
                  ? "max-w-[40ch] self-start text-base text-ink-muted"
                  : "max-w-[44ch] self-end text-right text-base text-ink"
              }
            >
              {turn.text}
            </p>
          ))}
          {live !== "" ? (
            <p className="max-w-[44ch] self-end text-right text-base text-accent">
              <span className="text-ink">{live.slice(0, spokenCount)}</span>
              {live.slice(spokenCount)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CitationChips({ sources }: { sources: Source[] }) {
  // The SDK does not expose per-message source_attribution on MessagePayload
  // (verified against @elevenlabs/types). We render citation chips from the
  // letter's own CodeLine → GOV.UK anchors, which is the authoritative mapping
  // of each line to the page that explains it.
  // TODO: confirm source_attribution field — switch to live per-message
  //       citations if a future SDK release surfaces them on the message object.
  const seen = new Set<string>();
  const unique = sources.filter((s) =>
    seen.has(s.anchor) ? false : (seen.add(s.anchor), true),
  );
  return (
    <div className="border-t border-rule pt-4">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">
        Official guidance
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {unique.map((s) => (
          <a
            key={s.anchor}
            href={`https://www.gov.uk/${s.anchor}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-tactile border border-rule px-3 py-1 text-sm text-ink-muted transition-opacity duration-150 ease-out hover:border-accent hover:text-accent"
          >
            GOV.UK — {s.label}
          </a>
        ))}
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

function statusLabel(status: string, language: Language): string {
  if (status === "connecting") return "Connecting…";
  if (status === "connected")
    return language === "cy" ? "Live · Cymraeg" : "Live";
  if (status === "error") return "Connection error";
  return "Not connected";
}

function messageOf(e: unknown): string {
  if (e instanceof DOMException && e.name === "NotAllowedError") {
    return "Microphone access was blocked. Allow the microphone and try again.";
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong starting the conversation.";
}
