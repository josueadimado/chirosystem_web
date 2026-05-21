"use client";

import { apiGetAuth } from "@/lib/api";
import { useEffect, useState } from "react";

export type PatientQuickContact = {
  phone: string;
  email: string;
};

/** Loads phone and email for a patient row (schedule side panels). */
export function usePatientQuickContact(patientId: number | null) {
  const [contact, setContact] = useState<PatientQuickContact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (patientId == null) {
      setContact(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void apiGetAuth<{ phone?: string; email?: string }>(`/patients/${patientId}/`)
      .then((p) => {
        if (!cancelled) {
          setContact({
            phone: p.phone ?? "",
            email: p.email ?? "",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setContact(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return { contact, loading };
}
