import { cn } from "@/lib/cn";

export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base =
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-[0.99]";
  const styles: Record<typeof variant, string> = {
    primary: "bg-black text-white hover:bg-black/90",
    secondary: "bg-black/7 text-black hover:bg-black/10",
    ghost: "bg-transparent text-black hover:bg-black/5",
    danger: "bg-red-600 text-white hover:bg-red-600/90",
  };

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        base,
        styles[variant],
        disabled ? "opacity-50 cursor-not-allowed active:scale-100" : "",
        className
      )}
    >
      {children}
    </button>
  );
}
