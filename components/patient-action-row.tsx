import Link from "next/link";
import { IconArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";

type PatientActionTone = "primary" | "outline" | "muted";

type PatientActionRowProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  tone?: PatientActionTone;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
};

const toneClasses: Record<
  PatientActionTone,
  { shell: string; iconWrap: string; title: string; desc: string; arrow: string }
> = {
  primary: {
    shell: "bg-[#16a349] text-white hover:bg-[#13823d]",
    iconWrap: "bg-white/20 group-hover:bg-white/30 [&_svg]:text-white",
    title: "text-white",
    desc: "text-white/90",
    arrow: "text-white/70 group-hover:text-white",
  },
  outline: {
    shell: "border-2 border-[#16a349] bg-white text-[#0d5c2e] hover:bg-[#ecfdf5]",
    iconWrap: "bg-[#ecfdf5] group-hover:bg-[#16a349]/10 [&_svg]:text-[#16a349]",
    title: "text-[#0d5c2e]",
    desc: "text-[#949494]",
    arrow: "text-[#16a349]/70 group-hover:text-[#16a349]",
  },
  muted: {
    shell: "border border-[#e8e8e8] bg-white text-[#0d5c2e] hover:bg-[#f5f5f5]",
    iconWrap: "bg-[#f5f5f5] group-hover:bg-[#e8e8e8] [&_svg]:text-[#0d5c2e]",
    title: "text-[#0d5c2e]",
    desc: "text-[#949494]",
    arrow: "text-[#0d5c2e]/50 group-hover:text-[#0d5c2e]",
  },
};

/**
 * Banani patient action row: icon + title/description + arrow.
 * Use for portal menu and booking hero choices.
 */
export function PatientActionRow({
  title,
  description,
  icon,
  tone = "muted",
  href,
  onClick,
  active,
  className,
}: PatientActionRowProps) {
  const resolvedTone: PatientActionTone = active ? "primary" : tone;
  const styles = toneClasses[resolvedTone];

  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-4">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
            styles.iconWrap,
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 text-left">
          <span className={cn("block text-base font-semibold", styles.title)}>{title}</span>
          <span className={cn("block text-xs", styles.desc)}>{description}</span>
        </span>
      </span>
      <IconArrowRight className={cn("h-5 w-5 shrink-0", styles.arrow)} />
    </>
  );

  const shellClass = cn(
    "group flex w-full items-center justify-between rounded-xl px-6 py-4 transition-colors",
    styles.shell,
    className,
  );

  if (href) {
    return (
      <Link href={href} className={shellClass}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={shellClass}>
      {inner}
    </button>
  );
}
