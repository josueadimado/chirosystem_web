import type { Metadata, Viewport } from "next";
import "./globals.css";
import "react-phone-number-input/style.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { Providers } from "./providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Relief Chiropractic",
  description: "Modern chiropractic clinic operating system",
  applicationName: "Relief Chiropractic",
  appleWebApp: {
    capable: true,
    title: "Relief Chiropractic",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

/** Theme color for browser chrome and installed PWA shell */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16a349" },
    { media: "(prefers-color-scheme: dark)", color: "#0d5c2e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body
        className="min-h-[100dvh] min-h-screen bg-background pb-[env(safe-area-inset-bottom)] text-foreground antialiased"
        suppressHydrationWarning
      >
        <ServiceWorkerRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
