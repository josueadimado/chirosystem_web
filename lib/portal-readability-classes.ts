import { cn } from "@/lib/utils";

/**
 * Applied to the main scrollable content wrapper inside admin/doctor layouts only.
 * Improves touch targets, type scale, and table density without affecting the public booking site.
 */
export const PORTAL_ZONE_CLASSES = cn(
  "text-[14px] leading-normal antialiased",
  "[&_input[data-slot=input]]:min-h-11 [&_input[data-slot=input]]:rounded-xl [&_input[data-slot=input]]:px-3 [&_input[data-slot=input]]:text-[14px]",
  "[&_textarea[data-slot=textarea]]:min-h-[7rem] [&_textarea[data-slot=textarea]]:rounded-xl [&_textarea[data-slot=textarea]]:px-3 [&_textarea[data-slot=textarea]]:py-2.5 [&_textarea[data-slot=textarea]]:text-[14px] [&_textarea[data-slot=textarea]]:leading-normal",
  "[&_label[data-slot=label]]:text-[14px] [&_label[data-slot=label]]:font-medium [&_label[data-slot=label]]:leading-normal",
  "[&_button[data-slot=button]]:min-h-11 [&_button[data-slot=button]]:px-4 [&_button[data-slot=button]]:text-[14px]",
  "[&_.admin-input]:min-h-11 [&_.admin-input]:px-3 [&_.admin-input]:text-[14px]",
  "[&_[data-slot=table]]:text-[14px]",
  "[&_[data-slot=table-head]]:h-12 [&_[data-slot=table-head]]:min-h-12 [&_[data-slot=table-head]]:px-3 [&_[data-slot=table-head]]:py-3",
  "[&_[data-slot=table-cell]]:min-h-12 [&_[data-slot=table-cell]]:px-3 [&_[data-slot=table-cell]]:py-3",
);
