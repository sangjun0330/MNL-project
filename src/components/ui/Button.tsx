import { cn } from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
  ...props
}: ButtonProps) {
  const handleClick: React.MouseEventHandler<HTMLButtonElement> | undefined = disabled
    ? undefined
    : onClick;

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-[0.99]",
        {
          primary: "bg-black text-white hover:bg-black/90",
          secondary: "bg-black/7 text-black hover:bg-black/10",
          ghost: "bg-transparent text-black hover:bg-black/5",
          danger: "bg-red-600 text-white hover:bg-red-600/90",
        }[variant],
        disabled ? "opacity-50 cursor-not-allowed active:scale-100" : "",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
