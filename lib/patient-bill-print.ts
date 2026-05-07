/**
 * Patient Bill HTML (statement layout) — used by the portal modal and optional new-window print.
 */

import { formatMonthDayYear, formatNowMonthDayYearTime } from "@/lib/format-date";

export type PatientBillLine = {
  service_offered: string;
  cpt_code: string;
  description: string;
  fees: string;
  units: string;
  pos: string;
  /** Full line amount (for insurance / documentation). */
  line_total: string;
  /** Same as line total on the printed bill (full documented amount per row). Patient invoice totals exclude lines with charges_patient false. */
  patient_due?: string;
  charges_patient?: boolean;
};

export type PatientBillPayload = {
  bill_title?: string;
  /** True when opened via ?preview=1 while invoice is unpaid — not the final paid bill. */
  is_preview?: boolean;
  clinic_name: string;
  address_line1: string;
  city_state_zip: string;
  phone: string;
  pos_default?: string;
  invoice_number: string;
  date_of_service: string;
  patient_name: string;
  patient_address: string;
  diagnosis: string;
  provider_name?: string;
  provider_credential?: string;
  lines: PatientBillLine[];
  subtotal: string;
  /** Sum of chargeable lines only (matches invoice balance before tax); omitted on old API responses. */
  patient_subtotal?: string;
  tax: string;
  total_amount: string;
  status?: string;
};

/** For React keys — changes when lines, totals, or diagnosis change (e.g. after billing edit). */
export function patientBillContentSignature(bill: PatientBillPayload): string {
  const lineSig = (bill.lines ?? [])
    .map((l) => `${l.cpt_code}:${l.units}:${l.fees}:${l.line_total}:${l.charges_patient ? 1 : 0}`)
    .join("|");
  return [
    bill.subtotal,
    bill.patient_subtotal ?? "",
    bill.tax,
    bill.total_amount,
    bill.diagnosis ?? "",
    lineSig,
  ].join("#");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function trimTextForPrint(input: string, maxChars: number): string {
  const v = (input || "").trim();
  if (!v || v.length <= maxChars) return v;
  return `${v.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function fitProfileForBill(b: PatientBillPayload) {
  const lineCount = b.lines.length;
  const totalDescriptionChars = b.lines.reduce((sum, line) => sum + (line.description || "").length, 0);
  const densityScore =
    lineCount * 1.4 +
    totalDescriptionChars / 180 +
    (b.diagnosis || "").length / 220 +
    (b.patient_address || "").length / 140 +
    (b.is_preview ? 2 : 0);

  if (densityScore >= 26) {
    return {
      profileName: "Extra compact",
      pageMarginMm: 5,
      bodyFontPx: 8.6,
      headingPx: 13,
      uiFontPx: 8.6,
      tableFontPx: 8,
      boxPaddingY: 3,
      boxPaddingX: 4,
      cellPaddingY: 2,
      cellPaddingX: 2,
      printZoom: 0.84,
      maxDescriptionChars: 58,
      maxDiagnosisChars: 220,
      maxAddressChars: 110,
    };
  }
  if (densityScore >= 20) {
    return {
      profileName: "Compact",
      pageMarginMm: 6,
      bodyFontPx: 9.2,
      headingPx: 14,
      uiFontPx: 9.2,
      tableFontPx: 8.4,
      boxPaddingY: 4,
      boxPaddingX: 5,
      cellPaddingY: 2,
      cellPaddingX: 2,
      printZoom: 0.88,
      maxDescriptionChars: 72,
      maxDiagnosisChars: 320,
      maxAddressChars: 140,
    };
  }
  return {
    profileName: "Standard",
    pageMarginMm: 7,
    bodyFontPx: 10,
    headingPx: 15,
    uiFontPx: 10,
    tableFontPx: 9,
    boxPaddingY: 5,
    boxPaddingX: 6,
    cellPaddingY: 3,
    cellPaddingX: 3,
    printZoom: 0.92,
    maxDescriptionChars: 96,
    maxDiagnosisChars: 520,
    maxAddressChars: 180,
  };
}

/** Full HTML document for the bill (no scripts). Safe for iframe srcDoc. */
export function getPatientBillDocumentHtml(b: PatientBillPayload): string {
  const fit = fitProfileForBill(b);
  const showPatientPortionRow =
    b.patient_subtotal != null && b.patient_subtotal !== b.subtotal;
  const diagnosisForPrint = trimTextForPrint(b.diagnosis || "", fit.maxDiagnosisChars);
  const patientAddressForPrint = trimTextForPrint(b.patient_address || "", fit.maxAddressChars);
  const rows = b.lines
    .map((l) => {
      const descriptionForPrint = trimTextForPrint(l.description || "", fit.maxDescriptionChars);
      const pat = l.patient_due != null ? l.patient_due : l.line_total;
      return `
    <tr>
      <td>${esc(l.cpt_code)}</td>
      <td>${esc(descriptionForPrint)}</td>
      <td class="num">$${esc(l.fees)}</td>
      <td class="num">${esc(l.units)}</td>
      <td class="num">${esc(l.pos)}</td>
      <td class="num">$${esc(l.line_total)}</td>
      <td class="num">$${esc(pat)}</td>
    </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(b.bill_title || "Patient Bill")} — ${esc(b.invoice_number)}</title>
  <style>
    @page { margin: ${fit.pageMarginMm}mm; size: letter; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: ${fit.bodyFontPx}px; margin: 0; padding: 8px; line-height: 1.22; }
    h1 { font-size: ${fit.headingPx}px; margin: 0 0 2px; font-family: system-ui, sans-serif; }
    .clinic { font-family: system-ui, sans-serif; font-size: ${fit.uiFontPx}px; line-height: 1.2; margin-bottom: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 6px 0; font-family: system-ui, sans-serif; font-size: ${fit.uiFontPx}px; }
    .box { border: 1px solid #333; padding: ${fit.boxPaddingY}px ${fit.boxPaddingX}px; min-height: 20px; }
    .label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; color: #444; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-family: system-ui, sans-serif; font-size: ${fit.tableFontPx}px; table-layout: fixed; }
    th, td { border: 1px solid #333; padding: ${fit.cellPaddingY}px ${fit.cellPaddingX}px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; font-weight: 700; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-top: 7px; max-width: 250px; margin-left: auto; font-family: system-ui, sans-serif; font-size: ${fit.uiFontPx}px; }
    .totals row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #ddd; }
    .grand { font-weight: 800; font-size: ${Math.max(10, fit.uiFontPx + 1)}px; margin-top: 4px; }
    .provider-signoff { margin-top: 7px; font-family: system-ui, sans-serif; font-size: ${Math.max(8, fit.uiFontPx - 0.4)}px; color: #334155; }
    .provider-signoff strong { color: #111827; }
    .foot { margin-top: 7px; font-size: ${Math.max(8, fit.uiFontPx - 0.6)}px; color: #555; font-family: system-ui, sans-serif; }
    .preview-banner { margin: 0 0 8px; padding: 6px 8px; background: #fffbeb; border: 1px solid #f59e0b; border-radius: 6px; font-family: system-ui, sans-serif; font-size: ${Math.max(8, fit.uiFontPx - 0.2)}px; color: #78350f; line-height: 1.22; }
    .preview-banner strong { display: block; font-size: ${Math.max(9, fit.uiFontPx)}px; margin-bottom: 2px; }
    .fit-chip { display: inline-block; margin-top: 5px; padding: 2px 6px; border-radius: 999px; border: 1px solid #f59e0b; background: #fff7ed; color: #9a3412; font-size: ${Math.max(8, fit.uiFontPx - 0.8)}px; font-weight: 600; }
    * { page-break-inside: avoid; }
    @media print { body { zoom: ${fit.printZoom}; } }
  </style>
</head>
<body>
  <h1>${esc(b.bill_title || "Patient Bill")}</h1>
  ${
    b.is_preview
      ? `<div class="preview-banner"><strong>Preview only</strong>This is what the bill will look like before payment. After the invoice is marked paid, use &ldquo;Print patient bill&rdquo; for the official copy. Use Print in the toolbar above or your browser&rsquo;s print dialog for a paper copy.<span class="fit-chip">Auto-fit mode: ${esc(fit.profileName)}</span></div>`
      : ""
  }
  <div class="clinic">
    <strong>${esc(b.clinic_name)}</strong><br/>
    ${esc(b.address_line1)}<br/>
    ${esc(b.city_state_zip)}<br/>
    ${esc(b.phone)}
  </div>
  <div class="grid">
    <div>
      <div class="label">Date of service</div>
      <div class="box">${esc(formatMonthDayYear(b.date_of_service))}</div>
    </div>
    <div>
      <div class="label">Bill / Invoice #</div>
      <div class="box">${esc(b.invoice_number)}</div>
    </div>
    <div style="grid-column: 1 / -1;">
      <div class="label">Patient</div>
      <div class="box">${esc(b.patient_name)}</div>
    </div>
    <div style="grid-column: 1 / -1;">
      <div class="label">Address</div>
      <div class="box">${esc(patientAddressForPrint)}</div>
    </div>
    <div style="grid-column: 1 / -1;">
      <div class="label">Diagnosis</div>
      <div class="box">${esc(diagnosisForPrint)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>CPT Code</th>
        <th>Description</th>
        <th class="num">Fees</th>
        <th class="num">Units</th>
        <th class="num">POS</th>
        <th class="num">Line total</th>
        <th class="num">Patient pays</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Subtotal (all procedures)</span><span>$${esc(b.subtotal)}</span></div>
    ${
      showPatientPortionRow
        ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#374151;"><span>Patient responsibility (billable services)</span><span>$${esc(b.patient_subtotal!)}</span></div>`
        : ""
    }
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Sales tax</span><span>$${esc(b.tax)}</span></div>
    <div class="grand" style="display:flex;justify-content:space-between;"><span>Amount due (patient)</span><span>$${esc(b.total_amount)}</span></div>
  </div>
  ${
    b.provider_name
      ? `<p class="provider-signoff">Treating provider: <strong>${esc(b.provider_name)}</strong>${b.provider_credential ? ` (${esc(b.provider_credential)})` : ""}</p>`
      : ""
  }
  <p class="foot">
    Line totals document every service on this visit. <strong>Subtotal</strong> is the full documented amount.
    <strong>Amount due</strong> is what the patient pays — insurance-only / documentation lines are not added to that balance.
    Patient payment per clinic policy.
    ${b.status ? ` Status: ${esc(b.status)}.` : ""}
    Generated ${esc(formatNowMonthDayYearTime())}.
  </p>
</body>
</html>`;
}

/**
 * Opens a new browser window with the bill (popup blockers may block this). Prefer {@link PatientBillPortalModal} in the app UI.
 */
export function openPatientBillPrint(b: PatientBillPayload) {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return false;

  let html = getPatientBillDocumentHtml(b);
  if (!b.is_preview) {
    html = html.replace("</body>", `<script>window.onload=function(){window.print();};</script></body>`);
  }

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
