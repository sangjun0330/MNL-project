"use client";

type IconProps = {
  className?: string;
};

export function SocialBatteryIcon({ className = "" }: IconProps) {
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
      <rect x="3.25" y="7" width="15.5" height="10" rx="2.6" />
      <path d="M20.75 10.5v3" />
      <rect x="5.5" y="9.25" width="8.75" height="5.5" rx="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SocialMoonIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 14.2A8.8 8.8 0 0 1 9.8 4a8.8 8.8 0 1 0 10.2 10.2Z" />
    </svg>
  );
}

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

export function SocialMegaphoneIcon({ className = "" }: IconProps) {
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
      <path d="M14.5 6.5 20 4v10l-5.5-2.5" />
      <path d="M4 9.5a2.5 2.5 0 0 1 2.5-2.5H13a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 13 13H6.5A2.5 2.5 0 0 1 4 10.5v-1Z" />
      <path d="m8.5 13 1.25 5h2L11 13" />
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

export function SocialInfoIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-1 4.25a1 1 0 0 1 1-1h.03a1 1 0 0 1 1 1v4.25a1 1 0 1 1-2 0v-4.25Z" clipRule="evenodd" />
    </svg>
  );
}

export function SocialAlertIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4.1a1 1 0 0 1 1 1v4.3a1 1 0 1 1-2 0V8.6a1 1 0 0 1 1-1Zm0 8.3a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z" clipRule="evenodd" />
    </svg>
  );
}

export function SocialWarningIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M10.39 4.68a1.85 1.85 0 0 1 3.22 0l6.08 10.85A1.85 1.85 0 0 1 18.08 18H5.92A1.85 1.85 0 0 1 4.3 15.53L10.39 4.68Zm1.61 3.07a1 1 0 0 1 1 1v3.8a1 1 0 1 1-2 0v-3.8a1 1 0 0 1 1-1Zm0 8.05a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z" clipRule="evenodd" />
    </svg>
  );
}

export function SocialChartIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="13" width="4" height="7" rx="1.25" />
      <rect x="10" y="9" width="4" height="11" rx="1.25" />
      <rect x="16" y="5" width="4" height="15" rx="1.25" />
    </svg>
  );
}

export function SocialHourglassIcon({ className = "" }: IconProps) {
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
      <path d="M7 3.5h10" />
      <path d="M7 20.5h10" />
      <path d="M8 3.5c0 3 4 4.4 4 8.5S8 17.5 8 20.5" />
      <path d="M16 3.5c0 3-4 4.4-4 8.5s4 5.5 4 8.5" />
      <path d="M9.5 7.25h5" />
      <path d="m10 14.25 4 2" />
    </svg>
  );
}

export function SocialGroupIcon({ className = "" }: IconProps) {
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
      <path d="M16 20v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 18.8V20" />
      <circle cx="10" cy="8.5" r="3.2" />
      <path d="M20 20v-1a3 3 0 0 0-2.4-2.94" />
      <path d="M15.6 4.65a3.2 3.2 0 0 1 0 6.1" />
    </svg>
  );
}

export function SocialTrophyIcon({ className = "" }: IconProps) {
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
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4H4a1 1 0 0 0-1 1v2a4 4 0 0 0 4 4" />
      <path d="M17 4h3a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4" />
      <path d="M6.5 4h11a.5.5 0 0 1 .5.5v7A5.5 5.5 0 0 1 12.5 17h-1A5.5 5.5 0 0 1 6 11.5v-7a.5.5 0 0 1 .5-.5Z" />
    </svg>
  );
}

export function SocialFlameIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2c-.4 0-.7.3-.7.7 0 3.2-2.1 5-3.8 6.4C5.8 10.5 4.5 11.7 4.5 14a7.5 7.5 0 0 0 15 0c0-5-4.1-7.7-5.4-11.1A.7.7 0 0 0 13.4 2H12Zm0 4.2c.9 2.4 3.1 4.3 3.1 7.8a3.1 3.1 0 0 1-6.2 0c0-1.6.8-2.5 1.9-3.4.5-.4 1-.9 1.2-1.5V6.2Z" />
    </svg>
  );
}

export function SocialBrainIcon({ className = "" }: IconProps) {
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
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15A2.5 2.5 0 0 1 9.5 22a2.5 2.5 0 0 1-2.45-2H4.5a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2 2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2 2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h2.55A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.45-2H19.5a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2 2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2 2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-2.55A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}

export function SocialStressIcon({ className = "" }: IconProps) {
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
      <path d="M4 8.5c1.6-2.6 3.5-3.9 5.7-3.9 2.7 0 3.4 2.2 5.1 2.2 1.1 0 2.3-.8 3.7-2.5" />
      <path d="M4 15.5c1.6-2.6 3.5-3.9 5.7-3.9 2.7 0 3.4 2.2 5.1 2.2 1.1 0 2.3-.8 3.7-2.5" />
      <path d="M18.2 4.2 20 5.8l-1.8 1.6" />
      <path d="M18.2 11.2 20 12.8l-1.8 1.6" />
    </svg>
  );
}

export function SocialActivityIcon({ className = "" }: IconProps) {
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
      <circle cx="14.5" cy="5.5" r="2.2" />
      <path d="m10.5 10.5 2.6-2.1 2 1.4 1.9 2.7" />
      <path d="m11 14-2.5 2.6" />
      <path d="m14.2 12.2-1.1 4.3" />
      <path d="m8.3 10 2.3 1.1" />
      <path d="m15.9 10.8 2.7-.3" />
    </svg>
  );
}

export function SocialCoffeeIcon({ className = "" }: IconProps) {
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
      <path d="M5 9.5h10.5a0.5 0.5 0 0 1 .5.5v3.4A4.6 4.6 0 0 1 11.4 18H9.6A4.6 4.6 0 0 1 5 13.4V9.5Z" />
      <path d="M16 10.5h1.1a2.9 2.9 0 0 1 0 5.8H16" />
      <path d="M7 20h11" />
      <path d="M9 5.2c0 1-.8 1.4-.8 2.3" />
      <path d="M12 4.4c0 1-.8 1.4-.8 2.3" />
      <path d="M15 5.2c0 1-.8 1.4-.8 2.3" />
    </svg>
  );
}

export function SocialMoodIcon({ className = "" }: IconProps) {
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
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 10.2h.01" />
      <path d="M14.8 10.2h.01" />
      <path d="M8.8 14.2c1 1.2 2 1.8 3.2 1.8s2.2-.6 3.2-1.8" />
    </svg>
  );
}

export function SocialTargetIcon({ className = "" }: IconProps) {
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
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function SocialPlusIcon({ className = "" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
