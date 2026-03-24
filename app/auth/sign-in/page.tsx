"use client";

import Image from "next/image";
import Link from "next/link";
import { IconEye, IconEyeOff } from "@/components/icons";
import { Loader } from "@/components/loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <main className="flex min-h-screen bg-background">
      {/* Left panel - branding */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-teal-700 to-teal-900 lg:flex lg:w-1/2">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.06\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />
        <div className="relative flex flex-col justify-between p-12 text-primary-foreground">
          <div>
            <span className="text-2xl font-extrabold tracking-tight text-white/95">Relief Chiropractic</span>
          </div>
          <div className="space-y-6">
            <h2 className="max-w-sm text-3xl leading-tight font-bold">Your clinic operations, simplified.</h2>
            <p className="max-w-sm text-lg text-white/80">
              Sign in to manage appointments, view patient records, and keep your practice running smoothly.
            </p>
          </div>
          <div className="relative h-56 overflow-hidden rounded-xl border border-white/20 shadow-2xl">
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
        <div className="content-fade-in mx-auto w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <span className="text-2xl font-extrabold text-primary">Relief Chiropractic</span>
          </div>

          <Card className="border-border/80 shadow-md">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <CardDescription>Sign in to your staff account</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleLogin();
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    className="h-11 px-4"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="h-11 pr-12 pl-4"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 w-full rounded-lg bg-[#e9982f] text-base font-semibold text-white shadow-sm hover:bg-[#cf8727] disabled:opacity-50"
                >
                  {isSubmitting ? <Loader variant="spinner" label="Signing in…" /> : "Sign in"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Staff access only. Patients should{" "}
                <Link href="/" className="font-medium text-primary underline-offset-2 hover:underline">
                  book an appointment
                </Link>{" "}
                instead.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
