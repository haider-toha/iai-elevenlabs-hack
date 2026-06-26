import { notFound } from "next/navigation";

import { ConvaiLeaf } from "@/components/convai-leaf";
import { getLetter } from "@/lib/api";
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
    <ConvaiLeaf
      letter={letter}
      letterBlock={letterBlock}
      letterBlockWelsh={letterBlockWelsh}
    />
  );
}
