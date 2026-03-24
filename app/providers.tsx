"use client";

import { AppFeedbackProvider } from "@/components/app-feedback";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AppFeedbackProvider>{children}</AppFeedbackProvider>;
}
