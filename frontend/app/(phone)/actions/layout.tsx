import type { ReactNode } from "react";

// The /actions pages are a deliberate, faithful clone of a real GOV.UK service,
// so they adopt the GOV.UK Design System while the rest of Marginalia stays
// editorial-press.
//
// The GDS stylesheet is global by nature — its `body`/`:root` base styles and
// brand colours would otherwise repaint Marginalia's own chrome (the iPhone
// status bar / bezel these pages are framed by). So we load a build-time copy in
// which EVERY selector is prefixed with `.govuk-embed`
// (public/vendor/govuk-frontend.scoped.css, generated from the vendored
// govuk-frontend.min.css) and render the whole page inside that wrapper. GDS
// rules can then only ever match inside `.govuk-embed`, never leak out.
//
// It's a <link> to a static asset rather than a bundler `import`: govuk-frontend's
// minified CSS ships a legacy `@media screen\0` IE hack that Turbopack's CSS
// parser rejects. React hoists the <link> into <head>; navigating away unmounts
// this layout and removes it.
export default function ActionsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Vendored GDS CSS is served from public/ and loaded by <link>: it can't
          go through the bundler (its `@media screen\0` IE hack breaks Turbopack). */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/vendor/govuk-frontend.scoped.css" />
      <div className="govuk-embed flex min-h-full flex-col">{children}</div>
    </>
  );
}
