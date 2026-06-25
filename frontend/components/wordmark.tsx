import Image from "next/image";
import Link from "next/link";

import logo from "@/app/logo.png";

// The brand lockup — the engraved Marginalia monogram beside the wordmark. Used
// as a home affordance on sub-pages (e.g. the 404); `href="/"` resolves to the
// citizen home. `sm` is the compact variant for slim headers and footers.
export function Wordmark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? 32 : 24;
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 text-ink transition-opacity duration-150 ease-out hover:opacity-70"
    >
      <Image src={logo} alt="" width={dim} height={dim} className="shrink-0" />
      <span
        className={`font-display font-semibold tracking-tight ${
          size === "md" ? "text-xl" : "text-base"
        }`}
      >
        Marginalia
      </span>
    </Link>
  );
}
