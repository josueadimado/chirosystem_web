"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { strVal } from "@/lib/digital-intake";
import { cn } from "@/lib/utils";

type Props = {
  formType: string;
  initial: Record<string, unknown>;
  alreadySubmitted?: boolean;
  busy?: boolean;
  onExit?: () => void;
  onSubmit: (payload: {
    answers: Record<string, unknown>;
    signature_name: string;
    save_as_draft: boolean;
    auto?: boolean;
  }) => Promise<void>;
};

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-[#0d5c2e]/30 placeholder:text-slate-400 focus:ring-2";
const areaClass = `${inputClass} min-h-[88px] resize-y`;

/** Pediatric symptom checklist (from Kids Intake Document). */
const PEDIATRIC_SYMPTOMS = [
  "Dizziness",
  "ADHD",
  "Hyperactivity",
  "Behavioral",
  "Poor Memory",
  "Insomnia",
  "Nightmares",
  "Convulsions/Paralysis",
  "Fainting",
  "Runny Nose",
  "Itchy Eyes",
  "Chronic Earaches",
  "Sinus Trouble",
  "Cough/Wheeze",
  "Asthma",
  "Allergies",
  "Frequent Colds",
  "Rashes",
  "Unusual Moles",
  "Heart Condition",
  "Diabetes",
  "Tuberculosis",
  "Hypertension",
  "Anemia",
  "Rheumatic Fever",
  "Digestive",
  "Constipation",
  "Diarrhea",
  "Poor Appetite",
  "Blood disorders",
  "Backaches",
  "Headaches",
  "Fever/Chills",
  "Arthritis",
  "Muscle Pain",
  "Chest Pain",
  "Broken bones",
  "Sprains/Strains",
  "Hernias",
  "Neck Pain",
  "Arm/Elbow Pain",
  "Leg/Hip Pain",
  "Knee/Foot Pain",
  "Growing pains",
  "Joint Pain",
  "Scoliosis",
  "Stomach Aches",
  "Bed Wetting",
  "Pain Urinating",
];

const ADULT_SYMPTOM_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Head / neck",
    items: [
      "Recent neck strain",
      "Dizziness or lightheadedness",
      "Fainting",
      "Temporary memory loss",
      "Numbness: face or arms",
      "Wear glasses/contacts",
      "Recent severe, sudden head pain",
      "Chronic headaches",
      "Migraine headaches",
      "Sinus trouble",
      "Loss of smell",
      "Ringing in ears",
      "Twitching of face",
      "Muscle spasms in neck",
      "Increased pain when you cough or sneeze",
      "Grating in neck",
      "Neck pain",
      "Tightness of shoulder muscles",
      "Pins and needles in arms, hands",
    ],
  },
  {
    title: "Chest / general",
    items: [
      "Low blood pressure",
      "High blood pressure",
      "Cardiovascular disease",
      "Diabetes (Type I or II)",
      "Asthma",
      "Allergies",
      "Thyroid trouble",
      "Fatigue",
      "Cold hands",
      "Cold sweats",
      "Shortness of breath",
      "TB",
      "Chest pain",
      "Heart attack",
      "Chest and left arm pain",
      "Rheumatic fever",
    ],
  },
  {
    title: "Back / abdomen / legs",
    items: [
      "Ulcers",
      "Mid back pain",
      "Liver trouble",
      "Gallbladder trouble",
      "Indigestion (GERD, IBS)",
      "Constipation",
      "Kidney trouble",
      "Bladder trouble",
      "Menstrual cramps, pain, or irregularity",
      "Sleeping problems",
      "Painful joints",
      "Swollen joints",
      "Arthritis",
      "Slipped disc",
      "Ruptured disc",
      "Previous disc surgery",
      "Low back pain",
      "Pinched nerves in back",
      "Leg pain",
      "Numbness in legs",
      "Swollen ankles",
      "Cold feet",
      "Pain in legs, feet",
    ],
  },
];

export function DigitalIntakeFormEditor({
  formType,
  initial,
  alreadySubmitted,
  busy,
  onExit,
  onSubmit,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => ({ ...initial }));
  const [signature, setSignature] = useState(strVal(initial, "signature_name"));
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [autoSaveNote, setAutoSaveNote] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);
  const skipAutoSave = useRef(true);
  const autoSaveSeq = useRef(0);

  const set = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const toggleListItem = (key: string, item: string) => {
    const cur = Array.isArray(answers[key]) ? (answers[key] as string[]) : [];
    set(key, cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]);
  };

  const steps = useMemo(() => {
    if (formType === "massage") return ["Contact", "Health", "Sign"];
    if (formType === "pediatric") return ["Child info", "Symptoms", "History", "Sign"];
    return ["About you", "History", "Today", "Policies", "Sign"];
  }, [formType]);

  const handleSave = async (draft: boolean, auto = false) => {
    if (!auto) setError("");
    try {
      if (auto) setAutoSaving(true);
      await onSubmit({
        answers: { ...answers, signature_name: signature },
        signature_name: signature,
        save_as_draft: draft,
        auto,
      });
      if (auto || draft) {
        setAutoSaveNote("Progress saved — you can leave and come back later.");
      }
    } catch (e) {
      if (!auto) {
        setError(e instanceof Error ? e.message : "Could not save.");
      } else {
        setAutoSaveNote("Could not auto-save right now. Tap Save draft if you leave.");
      }
    } finally {
      if (auto) setAutoSaving(false);
    }
  };

  // Auto-save drafts to the server shortly after the person types.
  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    const seq = ++autoSaveSeq.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setAutoSaving(true);
          await onSubmit({
            answers: { ...answers, signature_name: signature },
            signature_name: signature,
            save_as_draft: true,
            auto: true,
          });
          if (autoSaveSeq.current === seq) {
            setAutoSaveNote("Progress saved — you can leave and come back later.");
          }
        } catch {
          if (autoSaveSeq.current === seq) {
            setAutoSaveNote("Could not auto-save right now. Tap Save draft if you leave.");
          }
        } finally {
          if (autoSaveSeq.current === seq) setAutoSaving(false);
        }
      })();
    }, 1600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: save when answers/signature change
  }, [answers, signature]);

  const goBack = () => {
    if (step > 0) {
      setStep((s) => Math.max(0, s - 1));
      return;
    }
    void (async () => {
      try {
        await onSubmit({
          answers: { ...answers, signature_name: signature },
          signature_name: signature,
          save_as_draft: true,
          auto: true,
        });
      } catch {
        // Still leave — auto-save may have already stored recent progress.
      }
      onExit?.();
    })();
  };

  return (
    <div className="space-y-6">
      {alreadySubmitted ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          You already submitted this form. You can update answers and submit again if something changed.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </button>
        <p className="text-xs text-slate-500" aria-live="polite">
          {autoSaving ? "Saving progress…" : autoSaveNote}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              step === i ? "bg-[#0d5c2e] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {formType === "massage" && step === 0 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input className={inputClass} value={strVal(answers, "first_name")} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={strVal(answers, "last_name")} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={strVal(answers, "email")} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Date of birth">
            <input className={inputClass} type="date" value={strVal(answers, "date_of_birth")} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
          <Field label="Mobile phone">
            <input className={inputClass} value={strVal(answers, "phone")} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Home phone">
            <input className={inputClass} value={strVal(answers, "home_phone")} onChange={(e) => set("home_phone", e.target.value)} />
          </Field>
          <Field label="Work phone">
            <input className={inputClass} value={strVal(answers, "work_phone")} onChange={(e) => set("work_phone", e.target.value)} />
          </Field>
          <Field label="Referred by">
            <input className={inputClass} value={strVal(answers, "referred_by")} onChange={(e) => set("referred_by", e.target.value)} />
          </Field>
          <Field label="Street address" className="sm:col-span-2">
            <input className={inputClass} value={strVal(answers, "address_line1")} onChange={(e) => set("address_line1", e.target.value)} />
          </Field>
          <Field label="City">
            <input className={inputClass} value={strVal(answers, "city")} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <input className={inputClass} value={strVal(answers, "state")} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Zip">
            <input className={inputClass} value={strVal(answers, "zip")} onChange={(e) => set("zip", e.target.value)} />
          </Field>
          <Field label="Emergency contact name">
            <input className={inputClass} value={strVal(answers, "emergency_contact_name")} onChange={(e) => set("emergency_contact_name", e.target.value)} />
          </Field>
          <Field label="Emergency contact relationship">
            <input className={inputClass} value={strVal(answers, "emergency_contact_relationship")} onChange={(e) => set("emergency_contact_relationship", e.target.value)} />
          </Field>
          <Field label="Emergency phone">
            <input className={inputClass} value={strVal(answers, "emergency_contact_phone")} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
          </Field>
          <Field label="Physician name">
            <input className={inputClass} value={strVal(answers, "physician_name")} onChange={(e) => set("physician_name", e.target.value)} />
          </Field>
          <Field label="Physician phone">
            <input className={inputClass} value={strVal(answers, "physician_phone")} onChange={(e) => set("physician_phone", e.target.value)} />
          </Field>
          <Field label="Date of initial visit">
            <input className={inputClass} type="date" value={strVal(answers, "initial_visit_date")} onChange={(e) => set("initial_visit_date", e.target.value)} />
          </Field>
        </section>
      ) : null}

      {formType === "massage" && step === 1 ? (
        <section className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">How would you rate your general health?</legend>
            <div className="flex flex-wrap gap-3">
              {["Excellent", "Good", "Fair", "Poor"].map((opt) => (
                <label key={opt} className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="general_health"
                    checked={strVal(answers, "general_health") === opt}
                    onChange={() => set("general_health", opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Have you had a professional massage before?</legend>
            <div className="flex flex-wrap gap-4">
              {["Yes", "No"].map((opt) => (
                <label key={opt} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="prior_massage"
                    checked={strVal(answers, "prior_massage") === opt}
                    onChange={() => set("prior_massage", opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
            {strVal(answers, "prior_massage") === "Yes" ? (
              <Field label="Date of last treatment">
                <input className={inputClass} value={strVal(answers, "last_massage_date")} onChange={(e) => set("last_massage_date", e.target.value)} />
              </Field>
            ) : null}
          </fieldset>
          <Field label="Current medications & conditions they treat">
            <textarea className={areaClass} value={strVal(answers, "medications")} onChange={(e) => set("medications", e.target.value)} />
          </Field>
          <Field label="Allergies or hypersensitivities">
            <textarea className={areaClass} value={strVal(answers, "allergies")} onChange={(e) => set("allergies", e.target.value)} />
          </Field>
          <Field label="Major accidents or surgeries (include dates)">
            <textarea className={areaClass} value={strVal(answers, "accidents_surgeries")} onChange={(e) => set("accidents_surgeries", e.target.value)} />
          </Field>
          <Field label="Reason for initial visit">
            <textarea className={areaClass} value={strVal(answers, "reason_for_visit")} onChange={(e) => set("reason_for_visit", e.target.value)} />
          </Field>
        </section>
      ) : null}

      {formType === "pediatric" && step === 0 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Child first name">
            <input className={inputClass} value={strVal(answers, "first_name")} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Child last name">
            <input className={inputClass} value={strVal(answers, "last_name")} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="Parent / guardian names" className="sm:col-span-2">
            <input className={inputClass} value={strVal(answers, "parent_guardian_names")} onChange={(e) => set("parent_guardian_names", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={strVal(answers, "email")} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={strVal(answers, "phone")} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Birth date">
            <input className={inputClass} type="date" value={strVal(answers, "date_of_birth")} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
          <Field label="Sex">
            <input className={inputClass} value={strVal(answers, "sex")} onChange={(e) => set("sex", e.target.value)} />
          </Field>
          <Field label="Weight">
            <input className={inputClass} value={strVal(answers, "weight")} onChange={(e) => set("weight", e.target.value)} />
          </Field>
          <Field label="Height">
            <input className={inputClass} value={strVal(answers, "height")} onChange={(e) => set("height", e.target.value)} />
          </Field>
          <Field label="Number of siblings">
            <input className={inputClass} value={strVal(answers, "siblings_count")} onChange={(e) => set("siblings_count", e.target.value)} />
          </Field>
          <Field label="Street address" className="sm:col-span-2">
            <input className={inputClass} value={strVal(answers, "address_line1")} onChange={(e) => set("address_line1", e.target.value)} />
          </Field>
          <Field label="City">
            <input className={inputClass} value={strVal(answers, "city")} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <input className={inputClass} value={strVal(answers, "state")} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Zip">
            <input className={inputClass} value={strVal(answers, "zip")} onChange={(e) => set("zip", e.target.value)} />
          </Field>
          <Field label="Who referred you?">
            <input className={inputClass} value={strVal(answers, "referred_by")} onChange={(e) => set("referred_by", e.target.value)} />
          </Field>
          <Field label="Reason for seeking chiropractic care" className="sm:col-span-2">
            <textarea className={areaClass} value={strVal(answers, "reason_for_visit")} onChange={(e) => set("reason_for_visit", e.target.value)} />
          </Field>
          <Field label="Other doctors seen for this condition">
            <input className={inputClass} value={strVal(answers, "other_doctors")} onChange={(e) => set("other_doctors", e.target.value)} />
          </Field>
          <Field label="Prior treatment and outcome">
            <input className={inputClass} value={strVal(answers, "prior_treatment")} onChange={(e) => set("prior_treatment", e.target.value)} />
          </Field>
          <Field label="Other health problems" className="sm:col-span-2">
            <textarea className={areaClass} value={strVal(answers, "other_health_problems")} onChange={(e) => set("other_health_problems", e.target.value)} />
          </Field>
          <Field label="Insurance company">
            <input className={inputClass} value={strVal(answers, "insurance_company")} onChange={(e) => set("insurance_company", e.target.value)} />
          </Field>
          <Field label="Policy / member ID">
            <input className={inputClass} value={strVal(answers, "insurance_policy_number")} onChange={(e) => set("insurance_policy_number", e.target.value)} />
          </Field>
          <p className="sm:col-span-2 text-xs text-slate-500">
            We do not collect Social Security numbers online. Staff can record any extra insurance details in the office if needed.
          </p>
        </section>
      ) : null}

      {formType === "pediatric" && step === 1 ? (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">Check any current or past problems:</p>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {PEDIATRIC_SYMPTOMS.map((item) => {
              const selected = Array.isArray(answers.symptoms) && (answers.symptoms as string[]).includes(item);
              return (
                <label key={item} className="inline-flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!selected} onChange={() => toggleListItem("symptoms", item)} className="mt-0.5" />
                  {item}
                </label>
              );
            })}
          </div>
          <Field label="Other">
            <input className={inputClass} value={strVal(answers, "symptoms_other")} onChange={(e) => set("symptoms_other", e.target.value)} />
          </Field>
        </section>
      ) : null}

      {formType === "pediatric" && step === 2 ? (
        <section className="space-y-4">
          <Field label="Pediatrician name">
            <input className={inputClass} value={strVal(answers, "pediatrician_name")} onChange={(e) => set("pediatrician_name", e.target.value)} />
          </Field>
          <Field label="Date of last pediatrician visit">
            <input className={inputClass} type="date" value={strVal(answers, "pediatrician_last_visit")} onChange={(e) => set("pediatrician_last_visit", e.target.value)} />
          </Field>
          <Field label="Medications and conditions">
            <textarea className={areaClass} value={strVal(answers, "medications")} onChange={(e) => set("medications", e.target.value)} />
          </Field>
          <Field label="Birth location / type">
            <input className={inputClass} value={strVal(answers, "birth_location")} onChange={(e) => set("birth_location", e.target.value)} placeholder="Home, hospital, birthing center…" />
          </Field>
          <Field label="Pregnancy / delivery notes">
            <textarea className={areaClass} value={strVal(answers, "prenatal_notes")} onChange={(e) => set("prenatal_notes", e.target.value)} />
          </Field>
          <Field label="Feeding history">
            <textarea className={areaClass} value={strVal(answers, "feeding_history")} onChange={(e) => set("feeding_history", e.target.value)} />
          </Field>
          <Field label="Developmental milestones">
            <textarea className={areaClass} value={strVal(answers, "developmental_milestones")} onChange={(e) => set("developmental_milestones", e.target.value)} />
          </Field>
          <Field label="Childhood diseases">
            <textarea className={areaClass} value={strVal(answers, "childhood_diseases")} onChange={(e) => set("childhood_diseases", e.target.value)} />
          </Field>
          <Field label="Vaccination notes / reactions">
            <textarea className={areaClass} value={strVal(answers, "vaccination_notes")} onChange={(e) => set("vaccination_notes", e.target.value)} />
          </Field>
          <Field label="Injuries, falls, sports, accidents">
            <textarea className={areaClass} value={strVal(answers, "injuries_trauma")} onChange={(e) => set("injuries_trauma", e.target.value)} />
          </Field>
        </section>
      ) : null}

      {formType === "adult_chiropractic" && step === 0 ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input className={inputClass} value={strVal(answers, "first_name")} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={strVal(answers, "last_name")} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="Preferred name">
            <input className={inputClass} value={strVal(answers, "preferred_name")} onChange={(e) => set("preferred_name", e.target.value)} />
          </Field>
          <Field label="Date of birth">
            <input className={inputClass} type="date" value={strVal(answers, "date_of_birth")} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={strVal(answers, "email")} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Cell phone">
            <input className={inputClass} value={strVal(answers, "phone")} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Street" className="sm:col-span-2">
            <input className={inputClass} value={strVal(answers, "address_line1")} onChange={(e) => set("address_line1", e.target.value)} />
          </Field>
          <Field label="City">
            <input className={inputClass} value={strVal(answers, "city")} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="State">
            <input className={inputClass} value={strVal(answers, "state")} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Zip">
            <input className={inputClass} value={strVal(answers, "zip")} onChange={(e) => set("zip", e.target.value)} />
          </Field>
          <Field label="Occupation">
            <input className={inputClass} value={strVal(answers, "occupation")} onChange={(e) => set("occupation", e.target.value)} />
          </Field>
          <Field label="Employer">
            <input className={inputClass} value={strVal(answers, "employer")} onChange={(e) => set("employer", e.target.value)} />
          </Field>
          <Field label="Referred by">
            <input className={inputClass} value={strVal(answers, "referred_by")} onChange={(e) => set("referred_by", e.target.value)} />
          </Field>
          <Field label="Emergency contact">
            <input className={inputClass} value={strVal(answers, "emergency_contact_name")} onChange={(e) => set("emergency_contact_name", e.target.value)} />
          </Field>
          <Field label="Emergency phone">
            <input className={inputClass} value={strVal(answers, "emergency_contact_phone")} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
          </Field>
        </section>
      ) : null}

      {formType === "adult_chiropractic" && step === 1 ? (
        <section className="space-y-5">
          <Field label="Been to a chiropractor before? (who / when)">
            <input className={inputClass} value={strVal(answers, "prior_chiropractor")} onChange={(e) => set("prior_chiropractor", e.target.value)} />
          </Field>
          <Field label="Family physician">
            <input className={inputClass} value={strVal(answers, "physician_name")} onChange={(e) => set("physician_name", e.target.value)} />
          </Field>
          <Field label="Last physical exam">
            <input className={inputClass} value={strVal(answers, "last_physical")} onChange={(e) => set("last_physical", e.target.value)} />
          </Field>
          <Field label="Imaging (X-ray / MRI / CT) of spine or complaint area">
            <input className={inputClass} value={strVal(answers, "imaging")} onChange={(e) => set("imaging", e.target.value)} />
          </Field>
          <Field label="Hospitalizations (last 10 years)">
            <textarea className={areaClass} value={strVal(answers, "hospitalizations")} onChange={(e) => set("hospitalizations", e.target.value)} />
          </Field>
          <Field label="Surgeries">
            <textarea className={areaClass} value={strVal(answers, "surgeries")} onChange={(e) => set("surgeries", e.target.value)} />
          </Field>
          <Field label="Medications">
            <textarea className={areaClass} value={strVal(answers, "medications")} onChange={(e) => set("medications", e.target.value)} />
          </Field>
          <Field label="Vitamins / supplements">
            <textarea className={areaClass} value={strVal(answers, "vitamins")} onChange={(e) => set("vitamins", e.target.value)} />
          </Field>
          {ADULT_SYMPTOM_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">{group.title}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => {
                  const selected = Array.isArray(answers.health_problems) && (answers.health_problems as string[]).includes(item);
                  return (
                    <label key={item} className="inline-flex items-start gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={!!selected} onChange={() => toggleListItem("health_problems", item)} className="mt-0.5" />
                      {item}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <Field label="Allergy details (if checked)">
            <input className={inputClass} value={strVal(answers, "allergies")} onChange={(e) => set("allergies", e.target.value)} />
          </Field>
        </section>
      ) : null}

      {formType === "adult_chiropractic" && step === 2 ? (
        <section className="space-y-4">
          <Field label="Reason for visit today">
            <textarea className={areaClass} value={strVal(answers, "reason_for_visit")} onChange={(e) => set("reason_for_visit", e.target.value)} />
          </Field>
          <Field label="When did symptoms begin?">
            <input className={inputClass} type="date" value={strVal(answers, "symptoms_began")} onChange={(e) => set("symptoms_began", e.target.value)} />
          </Field>
          <Field label="How did they start?">
            <input className={inputClass} value={strVal(answers, "symptoms_how_started")} onChange={(e) => set("symptoms_how_started", e.target.value)} />
          </Field>
          <Field label="Pain today (0–10)">
            <input className={inputClass} value={strVal(answers, "pain_rating")} onChange={(e) => set("pain_rating", e.target.value)} />
          </Field>
          <Field label="Where do you feel pain / numbness / tingling? (describe areas)">
            <textarea className={areaClass} value={strVal(answers, "pain_map_notes")} onChange={(e) => set("pain_map_notes", e.target.value)} />
          </Field>
          <Field label="What makes it worse?">
            <input className={inputClass} value={strVal(answers, "aggravated_by")} onChange={(e) => set("aggravated_by", e.target.value)} />
          </Field>
          <Field label="What relieves symptoms?">
            <input className={inputClass} value={strVal(answers, "relieves_symptoms")} onChange={(e) => set("relieves_symptoms", e.target.value)} />
          </Field>
          <Field label="Activities limited by symptoms">
            <textarea className={areaClass} value={strVal(answers, "activity_limits")} onChange={(e) => set("activity_limits", e.target.value)} />
          </Field>
        </section>
      ) : null}

      {formType === "adult_chiropractic" && step === 3 ? (
        <section className="space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            By signing the next step, you acknowledge Relief Chiropractic’s informed consent for chiropractic care,
            HIPAA / protected health information consent, appointment cancellation policy, and financial policy
            (including that you are responsible for charges not paid by insurance).
          </p>
          <p>
            Full clinic policies are also available from the office. Ask staff if you need a printed copy.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={answers.policies_acknowledged === true}
              onChange={(e) => set("policies_acknowledged", e.target.checked)}
            />
            <span>I have read and agree to the consent, cancellation, and financial policies.</span>
          </label>
        </section>
      ) : null}

      {((formType === "massage" && step === 2) ||
        (formType === "pediatric" && step === 3) ||
        (formType === "adult_chiropractic" && step === 4)) && (
        <section className="space-y-4">
          {formType === "pediatric" ? (
            <p className="text-sm text-slate-600">
              I am the parent or legal guardian and I consent to chiropractic care for this child at Relief Chiropractic.
            </p>
          ) : null}
          <Field label={formType === "pediatric" ? "Parent / guardian signature (type full name)" : "Signature (type your full name)"}>
            <input className={inputClass} value={signature} onChange={(e) => setSignature(e.target.value)} />
          </Field>
        </section>
      )}

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={goBack}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25]"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave(false)}
            className="rounded-xl bg-[#0d5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a4a25] disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit form"}
          </button>
        )}
        <button
          type="button"
          disabled={busy || autoSaving}
          onClick={() => void handleSave(true)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Save draft
        </button>
      </div>
    </div>
  );
}
