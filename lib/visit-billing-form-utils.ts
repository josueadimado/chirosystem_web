/** Shared billing form math and sorting for visit panels. */

export type BillableServiceOption = {
  id: number;
  name: string;
  price: string;
  billing_code?: string;
  charges_patient?: boolean;
  is_active?: boolean;
};

export type VisitBillLine = { service_id: number; quantity: string; unit_price: string };

export function sortBillableServices(services: BillableServiceOption[], bookedServiceId: number | null): BillableServiceOption[] {
  return [...services].sort((a, b) => {
    if (bookedServiceId != null) {
      if (a.id === bookedServiceId && b.id !== bookedServiceId) return -1;
      if (b.id === bookedServiceId && a.id !== bookedServiceId) return 1;
    }
    const ca = (a.billing_code || "").toLowerCase();
    const cb = (b.billing_code || "").toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb);
    return a.name.localeCompare(b.name);
  });
}

export function computeBillingEstimates(
  billLines: VisitBillLine[],
  services: BillableServiceOption[],
  professionalDiscount: string,
): {
  estimatedSubtotal: number | null;
  discountAmount: number;
  estimatedAfterDiscount: number | null;
} {
  let total = 0;
  let hasLine = false;
  for (const line of billLines) {
    const svc = services.find((s) => s.id === line.service_id);
    if (!svc) continue;
    if (svc.charges_patient === false) continue;
    hasLine = true;
    const q = Math.max(1, parseInt(line.quantity, 10) || 1);
    const raw = line.unit_price.trim();
    const unit = raw ? parseFloat(raw) : parseFloat(svc.price);
    if (Number.isNaN(unit)) continue;
    total += unit * q;
  }
  const estimatedSubtotal = hasLine ? total : null;
  const rawDisc = professionalDiscount.trim();
  let discountAmount = 0;
  if (rawDisc && estimatedSubtotal != null) {
    const n = parseFloat(rawDisc);
    if (!Number.isNaN(n) && n >= 0) discountAmount = Math.min(n, estimatedSubtotal);
  }
  const estimatedAfterDiscount =
    estimatedSubtotal == null ? null : Math.max(0, estimatedSubtotal - discountAmount);
  return { estimatedSubtotal, discountAmount, estimatedAfterDiscount };
}

export function toggleBillLine(lines: VisitBillLine[], serviceId: number): VisitBillLine[] {
  const has = lines.some((r) => r.service_id === serviceId);
  if (has) return lines.filter((r) => r.service_id !== serviceId);
  return [...lines, { service_id: serviceId, quantity: "1", unit_price: "" }];
}
