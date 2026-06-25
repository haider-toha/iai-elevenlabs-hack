import Link from "next/link";
import { notFound } from "next/navigation";

import { getLetter } from "@/lib/api";
import { AutoFillForm } from "@/components/auto-fill-form";

// This route is a faithful clone of GOV.UK's "Update company car details"
// service, styled with the GOV.UK Design System on purpose — a different visual
// language from the rest of the app because it represents a government service.
// The Server Component fetches the letter and derives the field values; the
// "use client" leaf animates them being typed in. No useEffect data-fetching:
// the data is resolved here on the server and handed down as props.
export default async function UpdateCompanyCarPage({
  params,
}: {
  params: Promise<{ letterId: string }>;
}) {
  const { letterId } = await params;
  const letter = await getLetter(letterId);
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
      <GovukHeader />

      <div className="govuk-width-container">
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

// Crown logo omitted per the Open Government Licence — the black header bar and
// the service name stand in for it.
function GovukHeader() {
  return (
    <header className="govuk-header" data-module="govuk-header">
      <div className="govuk-header__container govuk-width-container">
        <div className="govuk-header__logo">
          <span className="govuk-header__logotype-text">GOV.UK</span>
        </div>
        <div className="govuk-header__content">
          <Link
            href="/"
            className="govuk-header__link govuk-header__service-name"
          >
            HMRC — Personal Tax Account
          </Link>
        </div>
      </div>
    </header>
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
