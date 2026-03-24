"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type SheetContextValue = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function useSheetContext(name: string) {
  const ctx = React.useContext(SheetContext)
  if (!ctx) throw new Error(`${name} must be used within <Sheet>`)
  return ctx
}

function Sheet({
  open: openProp = false,
  onOpenChange,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChange?.(next)
    },
    [onOpenChange]
  )

  React.useEffect(() => {
    if (!openProp) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openProp, setOpen])

  React.useEffect(() => {
    if (!openProp) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [openProp])

  return (
    <SheetContext.Provider value={{ open: openProp, onOpenChange: setOpen }}>{children}</SheetContext.Provider>
  )
}

function SheetTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  const { onOpenChange } = useSheetContext("SheetTrigger")
  return (
    <button type="button" className={className} {...props} onClick={() => onOpenChange(true)}>
      {children}
    </button>
  )
}

function SheetClose({ className, children, ...props }: React.ComponentProps<"button">) {
  const { onOpenChange } = useSheetContext("SheetClose")
  return (
    <button
      type="button"
      className={className}
      {...props}
      onClick={(e) => {
        props.onClick?.(e)
        onOpenChange(false)
      }}
    >
      {children}
    </button>
  )
}

const sheetSideClasses = {
  top: "inset-x-0 top-0 h-auto border-b",
  bottom: "inset-x-0 bottom-0 h-auto border-t",
  left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
  right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const { open, onOpenChange } = useSheetContext("SheetContent")
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !open) return null

  return createPortal(
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-[200] bg-slate-900/40 transition-opacity supports-backdrop-filter:backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-[200] flex flex-col gap-4 border-border bg-background bg-clip-padding p-6 text-sm shadow-lg",
          sheetSideClasses[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            onClick={() => onOpenChange(false)}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </Button>
        ) : null}
      </div>
    </>,
    document.body
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-0.5", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2 data-slot="sheet-title" className={cn("font-heading text-base font-medium text-foreground", className)} {...props} />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
