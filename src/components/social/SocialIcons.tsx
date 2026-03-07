"use client";

type IconProps = {
  className?: string;
};

export function SocialCalendarIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="3.2" />
      <path d="M8 2.75v3.5" />
      <path d="M16 2.75v3.5" />
      <path d="M3 9.25h18" />
      <path d="M8.5 13h.01" />
      <path d="M12 13h.01" />
      <path d="M15.5 13h.01" />
      <path d="M8.5 16.5h.01" />
      <path d="M12 16.5h.01" />
      <path d="M15.5 16.5h.01" />
    </svg>
  );
}

export function SocialBellIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
