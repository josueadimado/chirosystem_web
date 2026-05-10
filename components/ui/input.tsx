import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-[14px] leading-normal transition-colors outline-none file:inline-flex file:min-h-9 file:border-0 file:bg-transparent file:text-[14px] file:font-medium file:text-foreground placeholder:text-muted-foreground placeholder:text-[13px] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-[14px] dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
