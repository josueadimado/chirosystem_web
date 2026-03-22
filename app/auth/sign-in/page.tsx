"use client";

import Image from "next/image";
import Link from "next/link";
import { IconEye, IconEyeOff } from "@/components/icons";
import { Loader } from "@/components/loader";
import { apiPost } from "@/lib/api";
import { setRoleCookie } from "@/lib/auth";
import { UserRole } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginResponse = {
  access: string;
  refresh: string;
  user: {
    role: UserRole;
    full_name: string;
  };
};

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const routeForRole = (role: UserRole) => {
    if (role === "owner_admin" || role === "staff") return "/admin/dashboard";
    if (role === "doctor") return "/doctor/dashboard";
    return "/";
  };

  const handleLogin = async () => {
    setErrorMessage("");
    if (!username.trim() || !password.trim()) {
      setErrorMessage("Enter your username and password.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiPost<LoginResponse>("/auth/login/", { username, password });
      const role = result.user.role;
      localStorage.setItem("chiroflow_access_token", result.access);
      localStorage.setItem("chiroflow_refresh_token", result.refresh);
      localStorage.setItem("chiroflow_user_name", result.user.full_name || username);
      setRoleCookie(role);
      router.push(routeForRole(role));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid login. Please check your username and password.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#16a349] via-[#13823d] to-[#0d5c2e]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.06\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />
        <div className="relative flex flex-col justify-between p-12 text-white">
          <div>
            <span className="text-2xl font-extrabold tracking-tight text-white/95">Relief Chiropractic</span>
          </div>
          <div className="space-y-6">
            <h2 className="text-3xl font-bold leading-tight max-w-sm">
              Your clinic operations, simplified.
            </h2>
            <p className="text-white/80 max-w-sm text-lg">
              Sign in to manage appointments, view patient records, and keep your practice running smoothly.
            </p>
          </div>
          <div className="relative h-56 rounded-xl overflow-hidden border border-white/20 shadow-2xl">
            <Image
              src="/images/clinic-reception.png"
              alt="Clinic"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="content-fade-in mx-auto w-full max-w-sm">
          {/* Mobile branding */}
          <div className="lg:hidden mb-8 text-center">
            <span className="text-2xl font-extrabold text-[#16a349]">Relief Chiropractic</span>
          </div>

          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
              <p className="mt-1 text-slate-600">Sign in to your staff account</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="space-y-5"
            >
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-[#16a349] focus:outline-none focus:ring-2 focus:ring-[#16a349]/20 transition"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 focus:border-[#16a349] focus:outline-none focus:ring-2 focus:ring-[#16a349]/20 transition"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <IconEyeOff className="h-5 w-5" />
                    ) : (
                      <IconEye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="animate-fade-in rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-800">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#e9982f] px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-[#cf8727] focus:outline-none focus:ring-2 focus:ring-[#e9982f] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition"
              >
                {isSubmitting ? (
                  <Loader variant="spinner" label="Signing in…" />
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500">
              Staff access only. Patients should{" "}
              <Link href="/" className="font-medium text-[#16a349] hover:text-[#13823d] hover:underline">
                book an appointment
              </Link>{" "}
              instead.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
