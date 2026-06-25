import { notFound } from "next/navigation";

import { ConvaiLeaf } from "@/components/convai-leaf";
import { getLetter } from "@/lib/api";
import { env } from "@/lib/env";
import { buildLetterBlock, buildLetterBlockWelsh } from "@/lib/letter-format";

// The QR/cold-open target (§1.1). A thin async Server Component: it fetches the
// letter, builds the English + Welsh prompt blocks server-side, and hands the
// typed letter into the client leaf, which owns the single-column view-state
// flow (preparing → summary → conversation). The page root fills the bounded
// phone-shell column (flex min-h-0 flex-1 flex-col); it never uses dvh/vh — the
// frame owns the height.
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const letter = await getLetter(id);
  if (letter === null) notFound();

  // Both blocks are built server-side and handed to the leaf as props: English
  // for the opening session, Welsh for the session restarted on request.
  const letterBlock = buildLetterBlock(letter);
  const letterBlockWelsh = buildLetterBlockWelsh(letter);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-1.5">
        <span className="truncate font-display text-[0.7rem] font-medium uppercase tracking-[0.16em] text-ink-muted">
          HM Revenue &amp; Customs
        </span>
        <OneLoginButton />
      </header>

      <ConvaiLeaf
        letter={letter}
        letterBlock={letterBlock}
        letterBlockWelsh={letterBlockWelsh}
      />
    </div>
  );
}

function OneLoginButton() {
  // Styled stub for the "personalised actions" beat. It links to the One Login
  // simulator and never claims to return a National Insurance number (One Login
  // does not expose one). Bumped to a ≥44px tap target for the mobile header.
  return (
    <a
      href={env.NEXT_PUBLIC_ONE_LOGIN_URL}
      className="shrink-0 whitespace-nowrap rounded-tactile border border-rule-strong px-3 py-3 font-display text-sm font-medium text-ink transition-opacity duration-150 ease-out hover:opacity-70 active:opacity-60"
    >
      GOV.UK One Login
    </a>
  );
}
