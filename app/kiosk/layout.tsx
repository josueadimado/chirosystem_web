import { InstallAppCallout } from "@/components/install-app-callout";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Patient check-in",
  description: "Check in with the phone number on your appointment.",
  applicationName: "Relief — Check-in",
  manifest: "/manifest-kiosk.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Relief Check-in",
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
    { media: "(prefers-color-scheme: light)", color: "#16a349" },
    { media: "(prefers-color-scheme: dark)", color: "#0d5c2e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function KioskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <InstallAppCallout variant="kiosk" />
    </>
  );
}
