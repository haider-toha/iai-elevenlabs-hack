import type { ReactNode } from "react";

// The shared mobile app-shell AND the Mac-demo phone-frame in one server-only
// route-group layout (§3.2/§3.5). Route groups don't change URLs, so /l/[id]
// (the QR target) is unaffected. The FRAME owns the height — children never use
// dvh/vh (a child min-h-dvh would resolve to the whole browser window and
// overflow the Mac bezel). On a real phone the bezel is hidden and it's full-bleed.
export default function PhoneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-mist lg:grid lg:min-h-dvh lg:place-items-center lg:py-10">
      {/* device — owns height: min-h-dvh on a phone (keeps the address-bar-jump
          fix), a fixed 390×852 on the Mac; the lg-only bezel is sanctioned
          device chrome (§3.5), the rounded corners here are the phone frame, not
          a UI element — all real UI inside stays sharp / rounded-tactile. */}
      <div className="relative flex min-h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-surface lg:h-[852px] lg:min-h-0 lg:w-[390px] lg:rounded-[2.5rem] lg:border-[10px] lg:border-rule-strong">
        {/* app shell — the scrollable content region (§3.2); safe-area insets
            applied ONCE here so no page needs env() or fixed positioning. flex-1
            (not h-full) so the column fills the device whether its height comes
            from min-h-dvh or the fixed lg height. `overflow-y-auto` lets any page
            taller than the frame scroll (the framed GDS /actions/* documents on
            the fixed-height Mac bezel); pages that manage their own internal
            scroll + docked bars (/l/[id]) fill exactly and never trigger it. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
          {children}
        </div>
      </div>
    </div>
  );
}
