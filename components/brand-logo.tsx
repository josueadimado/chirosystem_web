"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/brand/relief-chiropractic-logo.png";
const LOGO_WIDTH = 420;
const LOGO_HEIGHT = 120;

type BrandLogoProps = {
  /** Full horizontal lockup, or circular emblem only (sidebar collapsed). */
  variant?: "full" | "mark";
  /** Light card behind logo — helps on dark or busy backgrounds. */
  onDark?: boolean;
  className?: string;
  priority?: boolean;
};

/**
 * Official Relief Chiropractic logo (sidebar, sign-in, booking, loaders).
 */
export function BrandLogo({ variant = "full", onDark = false, className, priority }: BrandLogoProps) {
  const img =
    variant === "mark" ? (
      <Image
        src={LOGO_SRC}
        alt=""
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn("h-10 w-[4.25rem] max-w-none object-cover object-left", className)}
      />
    ) : (
      <Image
        src={LOGO_SRC}
        alt="Relief Chiropractic"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn("h-auto w-auto max-h-12 max-w-[min(100%,16rem)] object-contain object-left", className)}
      />
    );

  if (!onDark) return img;

  return (
    <span className={cn("inline-flex rounded-xl bg-white px-3 py-2 shadow-md shadow-black/10", className)}>
      {img}
    </span>
  );
}
