import Link from "next/link";

// The GOV.UK action surfaced INSIDE the conversation as an overlay, not a route
// navigation. The caller ends the voice session when opening it (so the agent
// stops listening) and returns to the letter summary on dismiss. This is a deliberate
// government-service facsimile, built from the real GOV.UK Design System (v6.3.0):
// the brand masthead with the crown logotype, GDS Transport, the blue service bar
// and the green button with its bottom shadow.
//
// SCOPING (no leak): the GDS stylesheet is global by nature, so we load a copy in
// which every selector is prefixed `.govuk-embed`
// (public/vendor/govuk-frontend.scoped.css) and make THIS dialog the
// `.govuk-embed` scope root. GDS rules can only match inside it, so the chat
// behind the overlay keeps Marginalia's fonts/colours even while it's open; React
// removes the <link> when the overlay closes. The exported name/props are kept
// stable for convai-leaf.tsx, which renders this and owns the open/close state.
//
// Field values mirror the standalone /actions clone (registration, return date,
// P11D) so the in-chat preview matches the full form the primary CTA links to.
const FIELDS = [
  { label: "Vehicle registration number", value: "AB12 CDE" },
  { label: "Date the car was returned", value: "14 March 2026" },
  { label: "P11D value", value: "£18,700" },
] as const;

export function GovukEmbed({
  letterId,
  recipientName,
  onClose,
}: {
  letterId: string;
  recipientName: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Update your company car on GOV.UK"
      className="govuk-embed absolute inset-0 z-20 flex flex-col overflow-y-auto overscroll-contain"
    >
      {/* Scoped GDS stylesheet — loaded only while the overlay is mounted; every
          rule is prefixed `.govuk-embed`, so it cannot reach the chat behind it.
          Served from public/ via <link> (can't go through the bundler — IE hack). */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/vendor/govuk-frontend.scoped.css" />

      <GovukMasthead />
      <GovukServiceBar />

      <div className="govuk-width-container">
        {/* The back link IS the dismiss control (onClose), styled as the standard
            GOV.UK back link; the button chrome is reset so only the link shows. */}
        <button
          type="button"
          onClick={onClose}
          className="govuk-back-link cursor-pointer appearance-none border-0 bg-transparent"
        >
          Back to chat
        </button>

        <main className="govuk-main-wrapper">
          <span className="govuk-caption-l">Company car and fuel</span>
          <h1 className="govuk-heading-l">
            Tell us your company car has been returned
          </h1>
          <p className="govuk-body">
            We&rsquo;ll use these details to update {recipientName}&rsquo;s tax
            code so the right amount of tax is collected. Check each answer
            before you send it.
          </p>

          <dl className="govuk-summary-list">
            {FIELDS.map((f) => (
              <div key={f.label} className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">{f.label}</dt>
                <dd className="govuk-summary-list__value">{f.value}</dd>
              </div>
            ))}
          </dl>

          <Link
            href={`/actions/update-company-car/${letterId}`}
            role="button"
            draggable={false}
            data-module="govuk-button"
            className="govuk-button govuk-button--start"
          >
            Continue on GOV.UK
            <svg
              className="govuk-button__start-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="17.5"
              height="19"
              viewBox="0 0 33 40"
              aria-hidden="true"
              focusable="false"
            >
              <path fill="currentColor" d="M0 0h13l20 20-20 20H0l20-20z" />
            </svg>
          </Link>

          <p className="govuk-body-s">
            This is a prototype. No real change has been made to any tax record.
            Contains public sector information licensed under the Open
            Government Licence v3.0.
          </p>
        </main>
      </div>
    </div>
  );
}

// The GOV.UK brand masthead — crown + wordmark logotype on the brand-blue bar.
// The logotype is the vendored GDS SVG, served as a static asset so the long crown
// path isn't duplicated across the three surfaces that draw the masthead.
function GovukMasthead() {
  return (
    <div className="govuk-header">
      <div className="govuk-header__container govuk-width-container">
        <div className="govuk-header__logo">
          <span className="govuk-header__homepage-link">
            {/* Static SVG asset, not next/image: the GDS crown logotype rasterises
                identically and needs no optimisation pipeline. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="govuk-header__logotype"
              src="/vendor/govuk-logotype.svg"
              width={148}
              height={30}
              alt="GOV.UK"
            />
          </span>
        </div>
      </div>
    </div>
  );
}

// The service-information bar that sits under the masthead on real GOV.UK
// services, naming the service the page belongs to.
function GovukServiceBar() {
  return (
    <section
      aria-label="Service information"
      className="govuk-service-navigation"
    >
      <div className="govuk-width-container">
        <div className="govuk-service-navigation__container">
          <span className="govuk-service-navigation__service-name">
            <Link href="/" className="govuk-service-navigation__link">
              HMRC — Personal Tax Account
            </Link>
          </span>
        </div>
      </div>
    </section>
  );
}
