"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/** Full horizontal lockup — figure, R mark, and clinic name (white background). */
const LOGO_SRC = "/brand/relief-chiropractic-logo.png";
const LOGO_WIDTH = 1024;
const LOGO_HEIGHT = 383;

/** Square emblem (orange/green figure) — sidebar collapsed, loaders, favicons. */
const MARK_SRC = "/brand/relief-chiropractic-favicon.png";
const MARK_SIZE = 383;

type BrandLogoProps = {
  /** Full horizontal lockup, or emblem only (sidebar collapsed). */
  variant?: "full" | "mark";
  /** Extra white card behind logo — use on dark/colored panels if needed. */
  onDark?: boolean;
  className?: string;
  priority?: boolean;
};

/**
 * Official Relief Chiropractic and Wellness Center branding.
 */
export function BrandLogo({ variant = "full", onDark = false, className, priority }: BrandLogoProps) {
  const img =
    variant === "mark" ? (
      <Image
        src={MARK_SRC}
        alt=""
        width={MARK_SIZE}
        height={MARK_SIZE}
        priority={priority}
        className={cn("h-10 w-10 shrink-0 rounded-lg object-contain object-left", className)}
      />
    ) : (
      <Image
        src={LOGO_SRC}
        alt="Relief Chiropractic and Wellness Center"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn(
          "h-auto w-auto max-h-14 max-w-[min(100%,22rem)] object-contain object-left",
          className,
        )}
      />
    );

  if (!onDark) return img;

  return (
    <span className={cn("inline-flex rounded-xl bg-white px-3 py-2 shadow-md shadow-black/10", className)}>
      {img}
    </span>
  );
}
