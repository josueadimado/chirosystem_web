"use client";

/** How automated messages go out for this patient (saved on patient chart). */
export type NotifyChannel = "sms" | "email" | "both" | "none";

export const NOTIFY_CHANNEL_OPTIONS: { value: NotifyChannel; label: string }[] = [
  { value: "sms", label: "Text (SMS) only" },
  { value: "email", label: "Email only" },
  { value: "both", label: "Text and email" },
  { value: "none", label: "None" },
];

/** Paid bills / receipts — text-only is not offered yet; SMS + none + email + both. */
export const NOTIFY_BILLS_OPTIONS = NOTIFY_CHANNEL_OPTIONS.filter((o) => o.value !== "sms");

export type PatientCommunicationPrefs = {
  notify_booking: NotifyChannel;
  notify_reminders: NotifyChannel;
  notify_bills: NotifyChannel;
};

export const DEFAULT_COMM_PREFS: PatientCommunicationPrefs = {
  notify_booking: "sms",
  notify_reminders: "sms",
  notify_bills: "email",
};

function normalizeChannel(v: string | undefined, fallback: NotifyChannel): NotifyChannel {
  if (v === "sms" || v === "email" || v === "both" || v === "none") return v;
  return fallback;
}

export function communicationPrefsFromDetail(d: {
  notify_booking?: string;
  notify_reminders?: string;
  notify_bills?: string;
}): PatientCommunicationPrefs {
  return {
    notify_booking: normalizeChannel(d.notify_booking, "sms"),
    notify_reminders: normalizeChannel(d.notify_reminders, "sms"),
    notify_bills: normalizeChannel(d.notify_bills, "email"),
  };
}

type Props = {
  prefs: PatientCommunicationPrefs;
  onChange: (next: PatientCommunicationPrefs) => void;
  /** When false, reminder SMS note about TCPA consent is hidden (e.g. read-only). */
  showSmsConsentNote?: boolean;
  smsConsent?: boolean;
  disabled?: boolean;
};

function PrefChannelPicker({
  groupId,
  label,
  hint,
  value,
  onValueChange,
  disabled,
  options = NOTIFY_CHANNEL_OPTIONS,
}: {
  groupId: string;
  label: string;
  hint: string;
  value: NotifyChannel;
  onValueChange: (v: NotifyChannel) => void;
  disabled?: boolean;
  options?: { value: NotifyChannel; label: string }[];
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-slate-900">{label}</legend>
      <div
        className={`grid gap-2 ${
          options.length <= 2
            ? "sm:grid-cols-2"
            : options.length === 3
              ? "sm:grid-cols-3"
              : "sm:grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {options.map((o) => {
          const inputId = `${groupId}-${o.value}`;
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              htmlFor={inputId}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-3 text-sm transition ${
                selected
                  ? "border-emerald-400 bg-emerald-50/90 ring-1 ring-emerald-300/60"
                  : "border-slate-200 bg-white hover:border-slate-300"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                id={inputId}
                name={groupId}
                value={o.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onValueChange(o.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#16a349]"
              />
              <span className="leading-snug text-slate-800">{o.label}</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">{hint}</p>
    </fieldset>
  );
}

/** Booking, reminders, and bill delivery preferences (admin + doctor chart). */
export function PatientCommunicationPrefsFields({
  prefs,
  onChange,
  showSmsConsentNote = true,
  smsConsent = false,
  disabled = false,
}: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Communication preferences</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          For each row, pick one: text only, email only, text and email (both), or{" "}
          <span className="font-medium text-slate-700">none</span> (no automated messages for that category). New patients
          start with text for booking/reminders, email for bills, and SMS reminders allowed until you change them.
        </p>
      </div>
      <PrefChannelPicker
        groupId="notify-booking"
        label="Booking confirmations"
        hint="When an appointment is booked, rescheduled, or cancelled (online or from the desk)."
        value={prefs.notify_booking}
        disabled={disabled}
        onValueChange={(notify_booking) => onChange({ ...prefs, notify_booking })}
      />
      <PrefChannelPicker
        groupId="notify-reminders"
        label="Appointment reminders"
        hint="Day-before and same-day reminder messages."
        value={prefs.notify_reminders}
        disabled={disabled}
        onValueChange={(notify_reminders) => onChange({ ...prefs, notify_reminders })}
      />
      <PrefChannelPicker
        groupId="notify-bills"
        label="Paid bills / receipts"
        hint="Receipts are sent by email today. Pick email only, or both (email now; text later when we add it)."
        value={prefs.notify_bills === "sms" ? "email" : prefs.notify_bills}
        disabled={disabled}
        options={NOTIFY_BILLS_OPTIONS}
        onValueChange={(notify_bills) => onChange({ ...prefs, notify_bills })}
      />
      {showSmsConsentNote &&
      (prefs.notify_booking === "sms" ||
        prefs.notify_booking === "both" ||
        prefs.notify_reminders === "sms" ||
        prefs.notify_reminders === "both") ? (
        <p className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950">
          {smsConsent ? (
            <>SMS reminders are allowed for this patient when preferences include text.</>
          ) : (
            <>
              <span className="font-semibold">SMS reminders are off.</span> Check “SMS appointment reminders allowed”
              below if the patient wants text reminders.
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}
