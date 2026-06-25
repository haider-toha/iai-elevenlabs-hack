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
      className="w-full py-3 font-display text-sm font-medium text-ink-muted underline decoration-rule-strong underline-offset-4 transition duration-150 ease-out hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70"
    >
      Save this chat
    </button>
  );
}
