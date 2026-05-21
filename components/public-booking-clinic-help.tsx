"use client";

/** Patient-facing clinic phone shown on the public booking site. */
export const CLINIC_PHONE_DISPLAY = "+1 (269) 408-0303";
export const CLINIC_PHONE_TEL = "tel:+12694080303";

/** Short “call us” line for errors and empty availability states. */
export function PublicBookingClinicHelp({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-slate-600 ${className}`.trim()}>
      Need help?{" "}
      <a href={CLINIC_PHONE_TEL} className="font-semibold text-[#0d5c2e] underline-offset-4 hover:underline">
        {CLINIC_PHONE_DISPLAY}
      </a>
    </p>
  );
}
