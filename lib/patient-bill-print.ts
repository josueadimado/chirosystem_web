/**
 * Opens a print-friendly Patient Bill window (matches Relief Chiropractic statement layout).
 */

export type PatientBillLine = {
  service_offered: string;
  cpt_code: string;
  description: string;
  fees: string;
  units: string;
  pos: string;
  line_total: string;
};

export type PatientBillPayload = {
  bill_title?: string;
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
  lines: PatientBillLine[];
  subtotal: string;
  tax: string;
  total_amount: string;
  status?: string;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function openPatientBillPrint(b: PatientBillPayload) {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return false;

  const rows = b.lines
    .map(
      (l) => `
    <tr>
      <td>${esc(l.cpt_code)}</td>
      <td>${esc(l.description)}</td>
      <td class="num">$${esc(l.fees)}</td>
      <td class="num">${esc(l.units)}</td>
      <td class="num">${esc(l.pos)}</td>
      <td class="num">$${esc(l.line_total)}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(b.bill_title || "Patient Bill")} — ${esc(b.invoice_number)}</title>
  <style>
    @page { margin: 12mm; size: letter; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11px; margin: 0; padding: 16px; }
    h1 { font-size: 18px; margin: 0 0 4px; font-family: system-ui, sans-serif; }
    .clinic { font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; font-family: system-ui, sans-serif; font-size: 11px; }
    .box { border: 1px solid #333; padding: 8px; min-height: 36px; }
    .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #444; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-family: system-ui, sans-serif; font-size: 10px; }
    th, td { border: 1px solid #333; padding: 6px 5px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; font-weight: 700; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-top: 14px; max-width: 280px; margin-left: auto; font-family: system-ui, sans-serif; font-size: 11px; }
    .totals row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #ddd; }
    .grand { font-weight: 800; font-size: 13px; margin-top: 6px; }
    .foot { margin-top: 20px; font-size: 10px; color: #555; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <h1>${esc(b.bill_title || "Patient Bill")}</h1>
  <div class="clinic">
    <strong>${esc(b.clinic_name)}</strong><br/>
    ${esc(b.address_line1)}<br/>
    ${esc(b.city_state_zip)}<br/>
    ${esc(b.phone)}
  </div>
  <div class="grid">
    <div>
      <div class="label">Date of service</div>
      <div class="box">${esc(b.date_of_service)}</div>
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
      <div class="box">${esc(b.patient_address)}</div>
    </div>
    <div style="grid-column: 1 / -1;">
      <div class="label">Diagnosis</div>
      <div class="box">${esc(b.diagnosis)}</div>
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
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Subtotal</span><span>$${esc(b.subtotal)}</span></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Sales tax</span><span>$${esc(b.tax)}</span></div>
    <div class="grand" style="display:flex;justify-content:space-between;"><span>Amount due</span><span>$${esc(b.total_amount)}</span></div>
  </div>
  <p class="foot">
    Amount bill charges — patient payment may be collected at time of service per clinic policy.
    ${b.status ? ` Status: ${esc(b.status)}.` : ""}
    Generated ${esc(new Date().toLocaleString())}.
  </p>
  <script>window.onload=function(){window.print();};</script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
