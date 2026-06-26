"use client";

import { useState } from "react";

type FlagCode = "gb" | "cy" | "pl" | "ro" | "tr" | "pt" | "es" | "fr";
type Lang = { code: string; label: string; flag: FlagCode };

// Hardcoded language list — presentation-only in this build. English + Cymraeg
// are real; the rest signal multilingual reach for the demo. Selecting any row
// just closes the menu; nothing writes to a settings store.
const LANGUAGES: readonly Lang[] = [
  { code: "en", label: "English", flag: "gb" },
  { code: "cy", label: "Cymraeg", flag: "cy" },
  { code: "pl", label: "Polski", flag: "pl" },
  { code: "ro", label: "Română", flag: "ro" },
  { code: "tr", label: "Türkçe", flag: "tr" },
  { code: "pt", label: "Português", flag: "pt" },
  { code: "es", label: "Español", flag: "es" },
  { code: "fr", label: "Français", flag: "fr" },
];

// ---- icons ---------------------------------------------------------------

function IconGlobe({ className }: { className?: string }) {
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

function IconSearch({ className }: { className?: string }) {
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
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
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

// ---- flag glyphs ---------------------------------------------------------

// Inline SVG flag glyphs — no external assets, no network, self-contained.
// Each is a simplified national flag rendered at 60×40 so it reads at 20px.
function FlagIcon({ code }: { code: FlagCode }) {
  const cls = "size-5 shrink-0 overflow-hidden rounded-tactile";
  switch (code) {
    case "gb":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="60" height="40" fill="#012169" />
          <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" strokeWidth="8" />
          <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" strokeWidth="3" />
          <path d="M30 0 V40 M0 20 H60" stroke="#fff" strokeWidth="13" />
          <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" strokeWidth="7" />
        </svg>
      );
    case "cy":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="60" height="20" fill="#fff" />
          <rect y="20" width="60" height="20" fill="#00734C" />
          <path
            d="M30 8c-3 0-5 2-5 5 0 2 2 4 5 4s5-2 5-4c0-3-2-5-5-5z"
            fill="#A5333A"
          />
          <path d="M28 17v3M32 17v3" stroke="#A5333A" strokeWidth="1.5" />
        </svg>
      );
    case "pl":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="60" height="20" fill="#fff" />
          <rect y="20" width="60" height="20" fill="#DC143C" />
        </svg>
      );
    case "ro":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="20" height="40" fill="#002B7F" />
          <rect x="20" width="20" height="40" fill="#FCD116" />
          <rect x="40" width="20" height="40" fill="#C8102E" />
        </svg>
      );
    case "tr":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="60" height="40" fill="#E30A17" />
          <circle cx="22" cy="20" r="8" fill="#fff" />
          <circle cx="25" cy="20" r="6.5" fill="#E30A17" />
          <path d="M33 20l5-1.6-3.1 4.3V17.3l3.1 4.3z" fill="#fff" />
        </svg>
      );
    case "pt":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="24" height="40" fill="#006600" />
          <rect x="24" width="36" height="40" fill="#FF0000" />
          <circle
            cx="24"
            cy="20"
            r="7"
            fill="none"
            stroke="#FFD700"
            strokeWidth="2"
          />
        </svg>
      );
    case "es":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="60" height="40" fill="#AA151B" />
          <rect y="10" width="60" height="20" fill="#F1BF00" />
        </svg>
      );
    case "fr":
      return (
        <svg viewBox="0 0 60 40" aria-hidden className={cls}>
          <rect width="20" height="40" fill="#0055A4" />
          <rect x="20" width="20" height="40" fill="#fff" />
          <rect x="40" width="20" height="40" fill="#EF4135" />
        </svg>
      );
  }
}

// ---- shared dropdown panel -----------------------------------------------

// The scrollable dropdown panel shared by both trigger variants below.
// Presentation-only: selecting a row just closes the menu.
function LanguageMenuPanel({
  query,
  onQuery,
  onClose,
  direction = "down",
}: {
  query: string;
  onQuery: (q: string) => void;
  onClose: () => void;
  direction?: "up" | "down";
}) {
  const q = query.trim().toLowerCase();
  const matches = LANGUAGES.filter((lang) =>
    lang.label.toLowerCase().includes(q),
  );

  return (
    <div
      role="menu"
      className={`absolute right-0 z-10 w-64 rounded-card border border-rule bg-surface py-1 shadow-card ${
        direction === "up" ? "bottom-full mb-1" : "top-full mt-1"
      }`}
    >
      <div className="px-2 pb-1 pt-2">
        <div className="flex items-center gap-2 rounded-tactile bg-mist px-3 py-2">
          <IconSearch className="size-4 shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search languages"
            aria-label="Search languages"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>
      <ul className="max-h-64 overflow-y-auto overscroll-contain px-1 pb-1">
        {matches.length === 0 ? (
          <li className="px-3 py-2 text-sm text-ink-faint">
            No languages match &ldquo;{query}&rdquo;
          </li>
        ) : (
          matches.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                role="menuitem"
                onClick={onClose}
                className="flex w-full items-center gap-3 rounded-tactile px-3 py-2 text-left font-display text-sm text-ink transition-colors duration-150 ease-out hover:bg-mist active:bg-mist"
              >
                <FlagIcon code={lang.flag} />
                <span className="flex-1">{lang.label}</span>
                {lang.code === "en" ? (
                  <span className="text-xs text-ink-faint">Default</span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="mt-1 border-t border-rule px-1 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-1.5 rounded-tactile px-3 py-2 font-display text-sm font-medium text-ink-muted transition-colors duration-150 ease-out hover:bg-mist active:bg-mist"
        >
          See more languages
          <IconChevron className="size-3.5 rotate-90" />
        </button>
      </div>
    </div>
  );
}

// ---- exports -------------------------------------------------------------

// LanguagePicker — full-width row trigger for the home screen.
// Renders: globe icon + "Language" label + "English" + chevron right.
// Clicking opens the shared dropdown panel.
export function LanguagePicker({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center justify-between gap-4 rounded-card bg-mist px-5 py-3.5 text-left transition duration-150 ease-out hover:bg-lavender focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-70"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden className="shrink-0 text-ink-muted">
            <IconGlobe className="size-5" />
          </span>
          <span className="font-display text-base font-medium text-ink">
            Language
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-base text-ink-muted">English</span>
          <span aria-hidden className="shrink-0 text-ink-faint">
            <IconChevron className="size-5" />
          </span>
        </span>
      </button>
      {open ? (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-0 cursor-default bg-transparent"
        />
      ) : null}
      {open ? (
        <LanguageMenuPanel
          query={query}
          onQuery={setQuery}
          onClose={close}
          direction="up"
        />
      ) : null}
    </div>
  );
}

// LanguageGlobe — compact globe-icon trigger for the SummaryView top bar.
// Renders as a fragment so it sits inside the caller's relative container;
// the dropdown anchors to the nearest positioned ancestor (that header div).
export function LanguageGlobe() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid size-10 place-items-center text-ink-muted transition-opacity duration-150 ease-out active:opacity-60"
      >
        <IconGlobe className="size-5" />
      </button>
      {open ? (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-0 cursor-default bg-transparent"
        />
      ) : null}
      {open ? (
        <LanguageMenuPanel query={query} onQuery={setQuery} onClose={close} />
      ) : null}
    </>
  );
}
