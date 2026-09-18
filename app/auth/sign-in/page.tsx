"use client";

import Image from "next/image";
import { BrandLogo } from "@/components/brand-logo";
import {
  IconCalendar,
  IconClipboardList,
  IconEye,
  IconEyeOff,
  IconFileDollar,
} from "@/components/icons";
import { Loader } from "@/components/loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiPostPublic } from "@/lib/api";
import { setRoleCookie } from "@/lib/auth";
import { UserRole } from "@/lib/types";
import { Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginTokensResponse = {
  access: string;
  refresh: string;
  user: {
    role: UserRole;
    full_name: string;
  };
};

type LoginVerificationRequired = {
  verification_required: true;
  email_masked: string;
  verification_token: string;
};

function isVerificationRequired(x: unknown): x is LoginVerificationRequired {
  return (
    typeof x === "object" &&
    x !== null &&
    "verification_required" in x &&
    (x as LoginVerificationRequired).verification_required === true
  );
}

const fieldLabel = "mb-1.5 block text-sm font-medium text-[#0d1f14]";
const inputClass =
  "w-full rounded-lg border border-[#d1e8d8] bg-[#f4fbf7] py-3 text-sm text-[#0d1f14] placeholder:text-[#5a7a62] focus:border-[#16a349]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16a349]/20";

const FEATURES = [
  { icon: IconCalendar, text: "Manage daily appointments at a glance" },
  { icon: IconClipboardList, text: "Chart notes and clinical records" },
  { icon: IconFileDollar, text: "Billing and payment collection" },
] as const;

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  /** After password OK, email may require a 6-digit code. */
  const [step, setStep] = useState<"password" | "code">("password");
  const [verificationToken, setVerificationToken] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [code, setCode] = useState("");

  const routeForRole = (role: UserRole) => {
    if (role === "owner_admin" || role === "staff") return "/admin/dashboard";
    if (role === "doctor") return "/doctor/dashboard";
    return "/";
  };

  const finishSignIn = (result: LoginTokensResponse) => {
    const role = result.user.role;
    localStorage.setItem("chiroflow_access_token", result.access);
    localStorage.setItem("chiroflow_refresh_token", result.refresh);
    localStorage.setItem("chiroflow_user_name", result.user.full_name || username);
    setRoleCookie(role);
    router.push(routeForRole(role));
  };

  const handleLogin = async () => {
    setErrorMessage("");
    if (!username.trim() || !password.trim()) {
      setErrorMessage("Enter your username or email and your password.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiPostPublic<LoginTokensResponse | LoginVerificationRequired>("/auth/login/", {
        username,
        password,
      });
      if (isVerificationRequired(result)) {
        setVerificationToken(result.verification_token);
        setEmailMasked(result.email_masked);
        setStep("code");
        setCode("");
        return;
      }
      finishSignIn(result);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Invalid login. Please check your username or email and password.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    setErrorMessage("");
    const trimmed = code.replace(/\D/g, "");
    if (trimmed.length < 6) {
      setErrorMessage("Enter the 6-digit code from your email.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiPostPublic<LoginTokensResponse>("/auth/login/verify/", {
        verification_token: verificationToken,
        code: trimmed,
      });
      finishSignIn(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That code did not work. Try again or sign in from the start.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const backToPassword = () => {
    setStep("password");
    setVerificationToken("");
    setEmailMasked("");
    setCode("");
    setErrorMessage("");
  };

  return (
    <main className="flex min-h-screen bg-white">
      {/* Left branding panel - clinic photo + green wash */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2">
        <Image
          src="/images/clinic-reception.png"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="50vw"
        />
        <div className="absolute inset-0 bg-[#0d5c2e]/80" aria-hidden />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 text-white xl:p-16">
          <div>
            <BrandLogo variant="full" onDark className="max-h-14" priority />
          </div>

          <div className="flex max-w-md flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-[#16a349]" aria-hidden />
              <span className="text-sm font-medium text-white">Staff Portal</span>
            </div>
            <h1 className="text-4xl font-bold leading-tight text-white">Built for your team&apos;s best day.</h1>
            <p className="max-w-sm text-base text-white/80">
              Access your clinical dashboard, patient charts, and schedule all in one place.
            </p>

            <ul className="mt-2 flex flex-col gap-3">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </span>
                  <span className="text-sm text-white/90">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/50">&copy; 2026 Relief Chiropractic and Wellness Center</p>
        </div>
      </div>

      {/* Right sign-in form */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-16">
        <div className="content-fade-in w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandLogo variant="full" className="max-h-11" priority />
          </div>

          <div className="mb-8 lg:mb-10">
            <h2 className="text-3xl font-bold text-[#0d1f14]">
              {step === "code" ? "Verify your email" : "Staff Sign In"}
            </h2>
            <p className="mt-2 text-base text-[#5a7a62]">
              {step === "code"
                ? `We sent a 6-digit code to ${emailMasked}. Enter it below to finish signing in.`
                : "Enter your credentials to access the clinic portal."}
            </p>
          </div>

          {step === "code" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleVerifyCode();
              }}
              className="flex flex-col gap-5"
            >
              <div>
                <label htmlFor="code" className={fieldLabel}>
                  Verification code
                </label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={`${inputClass} px-4 tracking-widest`}
                  placeholder="000000"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              {errorMessage ? (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/5 py-3">
                  <AlertTitle className="text-sm">Verification failed</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 w-full rounded-lg bg-[#e9982f] py-4 text-base font-bold text-white hover:bg-[#cf8727] disabled:opacity-50"
              >
                {isSubmitting ? <Loader variant="spinner" label="Verifying..." /> : "Verify and sign in"}
              </button>

              <button
                type="button"
                onClick={backToPassword}
                className="w-full text-center text-sm text-[#5a7a62] underline-offset-2 hover:text-[#0d1f14] hover:underline"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin();
              }}
              className="flex flex-col gap-5"
            >
              <div>
                <label htmlFor="username" className={fieldLabel}>
                  Username or email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#5a7a62]"
                    aria-hidden
                  />
                  <input
                    id="username"
                    type="text"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    className={`${inputClass} pr-4 pl-11`}
                    placeholder="Clinic username or your email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className={fieldLabel}>
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#5a7a62]"
                    aria-hidden
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className={`${inputClass} pr-12 pl-11`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1.5 text-[#5a7a62] hover:bg-[#ecfdf5] hover:text-[#0d1f14]"
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {errorMessage ? (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/5 py-3">
                  <AlertTitle className="text-sm">Sign-in failed</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 w-full rounded-lg bg-[#e9982f] py-4 text-base font-bold text-white hover:bg-[#cf8727] disabled:opacity-50"
              >
                {isSubmitting ? <Loader variant="spinner" label="Signing in..." /> : "Sign In to Staff Portal"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
