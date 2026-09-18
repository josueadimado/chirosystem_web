"use client";

import { apiGetAuth } from "@/lib/api";
import { useEffect, useState } from "react";

export type PatientQuickContact = {
  phone: string;
  email: string;
  date_of_birth: string | null;
};

/** Loads phone and email for a patient row (schedule side panels). */
export function usePatientQuickContact(patientId: number | null) {
  const [contact, setContact] = useState<PatientQuickContact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (patientId == null) return;

    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- fetch contact when patient changes */
    setLoading(true);
    void apiGetAuth<{ phone?: string; email?: string; date_of_birth?: string | null }>(
      `/patients/${patientId}/`,
    )
      .then((p) => {
        if (!cancelled) {
          setContact({
            phone: p.phone ?? "",
            email: p.email ?? "",
            date_of_birth: p.date_of_birth ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setContact(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (patientId == null) {
    return { contact: null, loading: false };
  }

  return { contact, loading };
}
