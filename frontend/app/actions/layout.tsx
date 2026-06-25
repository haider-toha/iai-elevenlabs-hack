import type { ReactNode } from "react";

// The GOV.UK Design System stylesheet is scoped to this route group on purpose:
// the /actions pages are a deliberate clone of a real government service, so they
// adopt GOV.UK styling while the rest of the app stays editorial-press.
//
// It's loaded as a static asset via <link> rather than `import`ed through the
// bundler: govuk-frontend's minified CSS ships a legacy `@media screen\0` IE hack
// that Turbopack's CSS parser rejects. The file is copied into public/ by
// scripts/copy-govuk-assets.ts (wired to predev/prebuild) so it stays in sync
// with the installed package. React hoists this <link> into <head>.
//
// `govuk-template__body` carries the light-grey GDS page background. The root
// layout owns <html>/<body>, so we apply it to a wrapper here rather than adding
// a second document element.
export default function ActionsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/vendor/govuk-frontend.min.css" />
      <div className="govuk-template__body">{children}</div>
    </>
  );
}
