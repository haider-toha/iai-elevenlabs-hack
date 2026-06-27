import Link from "next/link";
import { notFound } from "next/navigation";

import { getLetter } from "@/lib/letters";
import { AutoFillForm } from "@/components/auto-fill-form";

// A faithful clone of GOV.UK's "Update company car details" service, built from
// the GOV.UK Design System (v6.3.0) — the brand masthead with the crown
// logotype, the blue service bar, GDS Transport type and the green button. The
// Server Component fetches the letter and derives the field values; the
// "use client" leaf animates them being typed in. No useEffect data-fetching:
// the data is resolved here on the server and handed down as props. The page is
// rendered inside the `.govuk-embed` scope wrapper (actions/layout.tsx), so the
// GDS styling never leaks into the surrounding iPhone-frame chrome.
export default async function UpdateCompanyCarPage({
  params,
}: {
  params: Promise<{ letterId: string }>;
}) {
  const { letterId } = await params;
  const letter = getLetter(letterId);
  if (!letter) notFound();
  const recipient =
    letter.type === "p2" ? letter.recipient_name : "the taxpayer";

  // The registration and the date the car went back are not on the coding
  // notice — they're the details this form exists to collect. For the mock we
  // pre-fill plausible demo values; the P11D figure is consistent with the
  // £3,740 taxable car benefit on Maria's P2.
  const fields = {
    registration: "AB12 CDE",
    dateReturned: "14 March 2026",
    p11dValue: "18,700",
  } as const;

  return (
    <>
      <GovukMasthead />
      <GovukServiceBar />

      <div className="govuk-width-container grow">
        {/* Standard GDS back link (not the editorial chevron) — this page is
            GOV.UK-scoped. It returns to the in-app chat the action was opened
            from. */}
        <Link href={`/l/${letterId}`} className="govuk-back-link">
          Back
        </Link>
        <main className="govuk-main-wrapper" id="main-content">
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-two-thirds">
              <span className="govuk-caption-l">Company car and fuel</span>
              <h1 className="govuk-heading-l">
                Tell us your company car has been returned
              </h1>
              <p className="govuk-body">
                We&rsquo;ll use these details to update {recipient}&rsquo;s tax
                code so the right amount of tax is collected. Check each answer
                before you send it.
              </p>

              <AutoFillForm
                letterId={letterId}
                registration={fields.registration}
                dateReturned={fields.dateReturned}
                p11dValue={fields.p11dValue}
              />
            </div>
          </div>
        </main>
      </div>

      <GovukFooter />
    </>
  );
}

// The GOV.UK brand masthead — crown + wordmark logotype on the brand-blue bar.
// The logotype is the vendored GDS SVG served as a static asset.
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
