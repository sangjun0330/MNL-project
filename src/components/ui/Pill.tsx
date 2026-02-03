import { cn } from "@/lib/cn";

export function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium", className)}>
      {children}
    </span>
  );
}
