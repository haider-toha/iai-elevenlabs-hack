"use client";

import { useState } from "react";

// Screen 10's optional "Save this chat" affordance. This is a DELIBERATE stub:
// it flips to "Saved" in local state and PERSISTS NOTHING. By this point the
// GOV.UK action nav has already unmounted the voice session, and this build has
// no store, no auth, no backend (§1.6 / §2 Screen 10) — so there is nothing real
// to save. It mirrors the GOV.UK action's honesty rather than faking a write.
export function SaveChatStub() {
  const [saved, setSaved] = useState(false);

  if (saved) {
    return (
      <p className="py-3 text-center font-display text-sm font-medium text-positive">
        Saved.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setSaved(true)}
      className="flex w-full items-center justify-center gap-2 rounded-tactile border border-rule bg-white px-5 py-3.5 font-display text-sm font-medium text-navy transition duration-150 ease-out hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70"
    >
      Save this chat
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="size-4 text-ink-faint"
      >
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v4h4" />
      </svg>
    </button>
  );
}
