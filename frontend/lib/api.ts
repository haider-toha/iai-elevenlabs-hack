import { z } from "zod";

import { env } from "@/lib/env";

const healthSchema = z.object({
  status: z.string(),
  service: z.string(),
});

export type Health = { online: true; service: string } | { online: false };

// The backend being down is a real, expected state — model it, don't throw.
export async function getHealth(): Promise<Health> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/health`, {
      cache: "no-store",
    });
    if (!res.ok) return { online: false };
    const data = healthSchema.parse(await res.json());
    return { online: true, service: data.service };
  } catch {
    return { online: false };
  }
}
