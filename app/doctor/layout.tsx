import type { Metadata, Viewport } from "next";
import { DoctorLayoutClient } from "./doctor-layout-client";

export const metadata: Metadata = {
  title: "Doctor portal",
  description: "Doctor dashboard, schedule, and patient tools.",
  applicationName: "Relief — Doctor",
  manifest: "/manifest-staff.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Relief Doctor",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d5c2e" },
    { media: "(prefers-color-scheme: dark)", color: "#052e18" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function DoctorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DoctorLayoutClient>{children}</DoctorLayoutClient>;
}
