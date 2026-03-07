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
