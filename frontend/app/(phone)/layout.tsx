import type { ReactNode } from "react";

// The shared mobile app-shell AND the Mac-demo iPhone frame in one server-only
// route-group layout (§3.2/§3.5). Route groups don't change URLs, so /l/[id]
// (the QR target) is unaffected. The FRAME owns the height — children never use
// dvh/vh (a child min-h-dvh would resolve to the whole browser window and
// overflow the bezel). The iOS chrome (status bar / Dynamic Island / home
// indicator) is lg-only: on a real phone the OS draws it, so the frame collapses
// to full-bleed below lg.
export default function PhoneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-mist lg:grid lg:min-h-dvh lg:place-items-center lg:py-10">
      {/* device — a FIXED height (h-dvh on a phone, 852px on the Mac) so a page
          taller than the screen scrolls INSIDE the frame instead of growing it;
          min-h-dvh would let tall pages push bottom-docked bars (the summary CTAs,
          the chat input) below the fold. overflow-hidden clips to the frame; the
          inner region does the scrolling. The lg-only bezel + rounded corners are
          sanctioned device chrome (§3.5) — every real UI element inside stays sharp
          / rounded-tactile. */}
      <div className="relative flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-surface lg:h-[852px] lg:w-[390px] lg:rounded-[2.5rem] lg:border-[10px] lg:border-bezel">
        {/* iOS status bar — Mac-demo chrome (hidden < lg). A flex sibling ABOVE the
            scroll region so it reserves its own height and never occludes a page's
            own header; it reads on the white surface, the way iOS draws it. */}
        <div className="hidden shrink-0 items-center justify-between px-6 pt-3 pb-2 text-ink lg:flex">
          <span className="tnum text-[15px] font-semibold leading-none">15:50</span>
          <div className="flex items-center gap-1.5">
            {/* cellular */}
            <svg viewBox="0 0 18 12" className="h-[11px] w-auto" fill="currentColor" aria-hidden>
              <rect x="0" y="8.5" width="3" height="3.5" rx="0.7" />
              <rect x="5" y="5.5" width="3" height="6.5" rx="0.7" />
              <rect x="10" y="2.75" width="3" height="9.25" rx="0.7" />
              <rect x="15" y="0" width="3" height="12" rx="0.7" />
            </svg>
            {/* wifi */}
            <svg viewBox="0 0 16 12" className="h-[11px] w-auto" fill="currentColor" aria-hidden>
              <path d="M8 2.2c2.5 0 4.8 1 6.5 2.6l-1.2 1.3A7.6 7.6 0 0 0 8 4.05 7.6 7.6 0 0 0 2.7 6.1L1.5 4.8A9.4 9.4 0 0 1 8 2.2Z" />
              <path d="M8 5.4c1.5 0 2.9.6 3.9 1.6l-1.25 1.3A4 4 0 0 0 8 7.2a4 4 0 0 0-2.65 1.1L4.1 7A5.6 5.6 0 0 1 8 5.4Z" />
              <circle cx="8" cy="9.6" r="1.25" />
            </svg>
            {/* battery */}
            <svg viewBox="0 0 25 12" className="h-[11px] w-auto" fill="none" aria-hidden>
              <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" strokeOpacity="0.4" />
              <rect x="2" y="2" width="15.5" height="8" rx="1.8" fill="currentColor" />
              <rect x="23" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" fillOpacity="0.5" />
            </svg>
          </div>
        </div>

        {/* Dynamic Island — floats over the centre of the status bar, the way iOS
            renders it above the app surface. */}
        <div
          aria-hidden
          className="absolute left-1/2 top-[11px] hidden h-[26px] w-[108px] -translate-x-1/2 rounded-full bg-bezel lg:block"
        />

        {/* app shell — the scrollable content region (§3.2); safe-area insets
            applied ONCE here so no page needs env() or fixed positioning. flex-1
            (not h-full) so the column fills the device whether its height comes
            from h-dvh or the fixed lg height. overflow-y-auto lets a page taller
            than the frame scroll (the framed GDS /actions/* documents); pages that
            manage their own internal scroll + docked bars (/l/[id]) fill exactly
            and never trigger it. lg:pb-5 reserves the bottom safe area for the home
            indicator so it never lands on a docked footer. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:pb-5">
          {children}
        </div>

        {/* home indicator — Mac-demo chrome (hidden < lg). */}
        <div
          aria-hidden
          className="absolute bottom-2 left-1/2 hidden h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-ink lg:block"
        />
      </div>
    </div>
  );
}
