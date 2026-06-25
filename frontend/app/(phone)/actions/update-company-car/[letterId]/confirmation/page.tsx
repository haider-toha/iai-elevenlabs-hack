import Link from "next/link";

// The GOV.UK Design System confirmation panel: the green box with the tick that
// every real GDS "you've sent it" screen uses. The honesty line is verbatim and
// non-negotiable — judges and any HMRC observer must not be able to misread this
// prototype as a real change to a tax record.
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ letterId: string }>;
}) {
  await params;

  return (
    <>
      <header className="govuk-header" data-module="govuk-header">
        <div className="govuk-header__container govuk-width-container">
          <div className="govuk-header__logo">
            <span className="govuk-header__logotype-text">GOV.UK</span>
          </div>
          <div className="govuk-header__content flex items-center justify-between gap-4">
            <Link
              href="/"
              className="govuk-header__link govuk-header__service-name"
            >
              HMRC — Personal Tax Account
            </Link>
            <Link
              href="/all-set"
              aria-label="Close"
              className="govuk-header__link inline-flex h-11 w-11 shrink-0 items-center justify-center text-2xl leading-none"
            >
              &times;
            </Link>
          </div>
        </div>
      </header>

      <div className="govuk-width-container">
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

              <p className="govuk-body">
                <Link href="/" className="govuk-link">
                  Return to home
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>

      <footer className="govuk-footer">
        <div className="govuk-width-container">
          <div className="govuk-footer__meta">
            <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
              <span className="govuk-footer__licence-description">
                This is a prototype. No real change has been made to any tax
                record. Contains public sector information licensed under the
                Open Government Licence v3.0.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
