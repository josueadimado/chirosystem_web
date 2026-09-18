"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function ScrollArea({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="scroll-area" className={cn("relative overflow-hidden", className)} {...props}>
      <div className="size-full overflow-auto rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1">
        {children}
      </div>
    </div>
  )
}

function ScrollBar(_props: React.ComponentProps<"div">) {
  void _props;
  return null
}

export { ScrollArea, ScrollBar }
