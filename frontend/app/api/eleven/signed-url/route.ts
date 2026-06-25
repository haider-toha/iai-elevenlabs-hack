import { NextResponse } from "next/server";
import { z } from "zod";

import { env, serverEnv } from "@/lib/env";

// ElevenLabs returns { signed_url } — validate that shape at this trust boundary
// rather than asserting it with `as`.
const signedUrlSchema = z.object({ signed_url: z.string().min(1) });

// Server-only handler: the API key is read via serverEnv() and used as a request
// header, never placed in any response body. The browser only ever sees signedUrl.
export async function GET() {
  const { XI_API_KEY } = serverEnv();
  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${env.NEXT_PUBLIC_AGENT_ID}`,
    { headers: { "xi-api-key": XI_API_KEY }, cache: "no-store" },
  );
  if (!r.ok)
    return NextResponse.json({ error: "signed_url_failed" }, { status: 502 });
  const { signed_url } = signedUrlSchema.parse(await r.json());
  return NextResponse.json({ signedUrl: signed_url });
}
