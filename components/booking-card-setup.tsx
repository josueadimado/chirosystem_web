"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPostPublic } from "@/lib/api";

type StripeConfig = { enabled: boolean; publishable_key: string };

function CardFormInner({
  phone,
  onSaved,
}: {
  phone: string;
  onSaved: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setErr("");
    setBusy(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (error) {
        setErr(error.message || "Card setup failed.");
        return;
      }
      const pm =
        typeof setupIntent?.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id;
      if (!pm) {
        setErr("Could not read payment method. Try again.");
        return;
      }
      await apiPostPublic("/booking-options/save-card/", {
        phone,
        payment_method_id: pm,
      });
      onSaved("Your card was saved securely. We only store the last four digits on file.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement />
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save card securely"}
      </button>
    </form>
  );
}

type Props = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | undefined;
};

/**
 * Optional Stripe card-on-file during booking (SetupIntent). Requires API keys in environment.
 */
export function BookingCardSetup({ firstName, lastName, email, phone }: Props) {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiGet<StripeConfig>("/booking-options/stripe-config/")
      .then(setConfig)
      .catch(() => setConfig({ enabled: false, publishable_key: "" }));
  }, []);

  const stripePromise = useMemo(() => {
    if (!config?.publishable_key) return null;
    return loadStripe(config.publishable_key);
  }, [config?.publishable_key]);

  const startSetup = useCallback(async () => {
    setLoadErr("");
    setSuccess("");
    if (!phone || !firstName.trim() || !lastName.trim()) {
      setLoadErr("Enter your name and a valid phone number first.");
      return;
    }
    try {
      const res = await apiPostPublic<{ client_secret: string }>("/booking-options/card-setup-intent/", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone,
      });
      setClientSecret(res.client_secret);
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not start card setup.");
    }
  }, [phone, firstName, lastName, email]);

  if (!config?.enabled) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Card-on-file checkout will be available when the clinic enables online payments.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional — faster checkout</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        If you would like to expedite your checkout, please register your credit card in our secured database. Once you
        have inputted your information, we can only see the <strong>last four digits</strong> of this card.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        Your card will only be charged at the time of service and per our client payment policy. This also applies to
        any <strong>HSA (health savings account)</strong> debit cards.
      </p>
      {!clientSecret && (
        <button
          type="button"
          onClick={startSetup}
          className="mt-3 rounded-lg border border-[#16a349] bg-[#16a349]/5 px-4 py-2 text-sm font-semibold text-[#166534] hover:bg-[#16a349]/10"
        >
          Add a card (optional)
        </button>
      )}
      {loadErr && <p className="mt-2 text-sm text-rose-600">{loadErr}</p>}
      {success && <p className="mt-2 text-sm font-medium text-[#166534]">{success}</p>}

      {clientSecret && stripePromise && (
        <div className="mt-4">
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe", variables: { colorPrimary: "#16a349" } },
            }}
          >
            <CardFormInner
              phone={phone!}
              onSaved={(msg) => {
                setSuccess(msg);
                setClientSecret(null);
              }}
            />
          </Elements>
        </div>
      )}
    </div>
  );
}
