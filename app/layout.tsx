import type { Metadata } from "next";
import "./globals.css";
import "react-phone-number-input/style.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Relief Chiropractic",
  description: "Modern chiropractic clinic operating system",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className="bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
