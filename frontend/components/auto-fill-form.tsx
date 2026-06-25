"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

const CHAR_MS = 25; // dwell per character — slow enough to watch, fast enough to feel automatic
const FIELD_GAP_MS = 400; // pause between one field finishing and the next starting

type Props = {
  letterId: string;
  registration: string;
  dateReturned: string;
  p11dValue: string;
};

// The visible "wow": the citizen watches the form fill itself. We own this form,
// so there's no DOM-scraping or browser automation — each field's value is
// revealed one character at a time by scheduling timers in a single effect.
// Animation/timer work is the one legitimate use of useEffect here; this is not
// data-fetching (the values arrive as props from the Server Component).
export function AutoFillForm({
  letterId,
  registration,
  dateReturned,
  p11dValue,
}: Props) {
  const router = useRouter();
  const [typedRegistration, setTypedRegistration] = useState("");
  const [typedDate, setTypedDate] = useState("");
  const [typedP11d, setTypedP11d] = useState("");
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const sequence: { value: string; set: (s: string) => void }[] = [
      { value: registration, set: setTypedRegistration },
      { value: dateReturned, set: setTypedDate },
      { value: p11dValue, set: setTypedP11d },
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];
    let offset = 0;

    for (const { value, set } of sequence) {
      for (let i = 1; i <= value.length; i++) {
        offset += CHAR_MS;
        const slice = value.slice(0, i);
        timers.push(setTimeout(() => set(slice), offset));
      }
      offset += FIELD_GAP_MS;
    }
    timers.push(setTimeout(() => setFilled(true), offset));

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [registration, dateReturned, p11dValue]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/actions/update-company-car/${letterId}/confirmation`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Field
        id="registration"
        label="Vehicle registration number"
        hint="The number plate of the car you no longer have"
        value={typedRegistration}
      />
      <Field
        id="date-returned"
        label="Date the car was returned to your employer"
        hint="For example, 14 March 2026"
        value={typedDate}
      />
      <Field
        id="p11d-value"
        label="P11D value"
        hint="The list price of the car, in pounds, as shown on your P11D"
        value={typedP11d}
        prefix="£"
      />

      <button
        type="submit"
        className="govuk-button"
        data-module="govuk-button"
        disabled={!filled}
        aria-disabled={!filled}
      >
        Confirm and send
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  prefix,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  prefix?: string;
}) {
  return (
    <div className="govuk-form-group">
      <label className="govuk-label govuk-label--s" htmlFor={id}>
        {label}
      </label>
      <div id={`${id}-hint`} className="govuk-hint">
        {hint}
      </div>
      {prefix ? (
        <div className="govuk-input__wrapper">
          <div className="govuk-input__prefix" aria-hidden="true">
            {prefix}
          </div>
          <input
            className="govuk-input govuk-input--width-10"
            id={id}
            name={id}
            type="text"
            aria-describedby={`${id}-hint`}
            value={value}
            readOnly
          />
        </div>
      ) : (
        <input
          className="govuk-input govuk-input--width-20"
          id={id}
          name={id}
          type="text"
          aria-describedby={`${id}-hint`}
          value={value}
          readOnly
        />
      )}
    </div>
  );
}
