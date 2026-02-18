import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-apple border border-ios-sep bg-ios-card shadow-apple", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between px-5 pt-5">
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.01em]">{title}</div>
        {subtitle ? <div className="mt-1 text-[12.5px] text-ios-sub">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 pb-5 pt-4", className)}>{children}</div>;
}
