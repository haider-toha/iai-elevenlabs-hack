import { z } from "zod";

// The frontend's trust boundary for configuration. Validate once here and fail
// loudly on misconfiguration; import `env` elsewhere, never `process.env`.
// NEXT_PUBLIC_* names must be referenced literally so Next inlines them.
//
// Browser-safe vars ONLY. This object is imported by client components
// (convai-leaf reads NEXT_PUBLIC_AGENT_ID and the voice IDs), so it must never
// reference a server-only secret — that would crash the client-side parse and
// risk shipping the secret to the browser. Server-only vars live in serverEnv().
const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:8000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_AGENT_ID: z.string().min(1),
  NEXT_PUBLIC_XI_VOICE_ID_ENGLISH: z.string().min(1),
  NEXT_PUBLIC_XI_VOICE_ID_WELSH: z.string().min(1),
  NEXT_PUBLIC_ONE_LOGIN_URL: z.url().default("http://localhost:3001"),
});

export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_AGENT_ID: process.env.NEXT_PUBLIC_AGENT_ID,
  NEXT_PUBLIC_XI_VOICE_ID_ENGLISH: process.env.NEXT_PUBLIC_XI_VOICE_ID_ENGLISH,
  NEXT_PUBLIC_XI_VOICE_ID_WELSH: process.env.NEXT_PUBLIC_XI_VOICE_ID_WELSH,
  NEXT_PUBLIC_ONE_LOGIN_URL: process.env.NEXT_PUBLIC_ONE_LOGIN_URL,
});

const serverSchema = z.object({
  XI_API_KEY: z.string().min(1),
});

// Server-only. Never import into a client component — it reads process.env at
// call time on the server. Called only inside /api/eleven/signed-url so the
// ElevenLabs key never enters the browser bundle.
export function serverEnv() {
  return serverSchema.parse({
    XI_API_KEY: process.env.XI_API_KEY,
  });
}
