"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type CheckboxProps = Omit<React.ComponentProps<"input">, "type"> & {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, checked, defaultChecked, ...props }, ref) => {
    // Controlled checkboxes need explicit visual styles — peer-checked alone can miss React's checked prop.
    const showChecked =
      checked === true || (checked === undefined && defaultChecked === true)

    return (
      <span
        className={cn(
          "relative inline-flex size-4 shrink-0 items-center justify-center",
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          data-slot="checkbox"
          className="peer absolute inset-0 z-10 size-4 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
          defaultChecked={defaultChecked}
          checked={checked}
          onChange={(e) => {
            onChange?.(e)
            onCheckedChange?.(e.target.checked)
          }}
        />
        <span
          className={cn(
            "pointer-events-none flex size-4 items-center justify-center rounded-[4px] border border-input bg-background transition-colors [&_svg]:opacity-0",
            "peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:[&_svg]:opacity-100",
            showChecked &&
              "border-primary bg-primary text-primary-foreground [&_svg]:opacity-100",
          )}
          aria-hidden
        >
          <CheckIcon className="size-3.5" />
        </span>
      </span>
    )
  },
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
