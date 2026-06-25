import { z } from "zod";

// The frontend's trust boundary for configuration. Validate once here and fail
// loudly on misconfiguration; import `env` elsewhere, never `process.env`.
// NEXT_PUBLIC_* names must be referenced literally so Next inlines them.
const schema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:8000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
