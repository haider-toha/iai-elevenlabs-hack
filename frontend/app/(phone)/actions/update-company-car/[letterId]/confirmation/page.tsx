import Link from "next/link";

// The GOV.UK Design System confirmation screen: the green panel with the heading
// that every real GDS "you've sent it" page uses, under the brand masthead. The
// honesty line is verbatim and non-negotiable — judges and any HMRC observer must
// not be able to misread this prototype as a real change to a tax record. Rendered
// inside the `.govuk-embed` scope wrapper (actions/layout.tsx) so the GDS styling
// never leaks into the surrounding iPhone-frame chrome.
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ letterId: string }>;
}) {
  await params;

  return (
    <>
      <GovukMasthead />
      <GovukServiceBar />

      <div className="govuk-width-container grow">
        <main className="govuk-main-wrapper" id="main-content">
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-two-thirds">
              <div className="govuk-panel govuk-panel--confirmation">
                <h1 className="govuk-panel__title">Details received</h1>
                <div className="govuk-panel__body">
                  Your company car update has been submitted
                </div>
              </div>

              <p className="govuk-body">
                Your details have been received. In production this would update
                your tax code with HMRC. No real change has been made.
              </p>

              <h2 className="govuk-heading-m">What happens next</h2>
              <p className="govuk-body">
                In a live service, HMRC would issue a new coding notice within a
                few working days, replacing code 883L with 1257L and stopping
                the overpayment.
              </p>

              {/* Exit continues to the editorial "You're all set" wrap-up
                  (/all-set) — the storyboard's success beat (frame 10) — which
                  then offers the single "Finish" home, rather than dropping the
                  citizen straight to the dashboard from inside the GDS scope. */}
              <p className="govuk-body">
                <Link href="/all-set" className="govuk-link">
                  Continue
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>

      <GovukFooter />
    </>
  );
}

// The GOV.UK brand masthead — crown + wordmark logotype on the brand-blue bar.
function GovukMasthead() {
  return (
    <div className="govuk-header">
      <div className="govuk-header__container govuk-width-container">
        <div className="govuk-header__logo">
          <Link href="/" className="govuk-header__homepage-link">
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
          </Link>
        </div>
      </div>
    </div>
  );
}

// The service-information bar that names the service this page belongs to.
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

function GovukFooter() {
  return (
    <footer className="govuk-footer">
      <div className="govuk-width-container">
        <div className="govuk-footer__meta">
          <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
            <span className="govuk-footer__licence-description">
              This is a prototype. No real change has been made to any tax
              record. Contains public sector information licensed under the Open
              Government Licence v3.0.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
