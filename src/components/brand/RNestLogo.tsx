"use client";

import { cn } from "@/lib/cn";

type RNestLogoProps = {
  className?: string;
  title?: string;
};

function RNestGlyphPaths() {
  return (
    <>
      <path
        d="M51 101C28 87 16 67 16 42c0-3 0-6 .4-8.9 4 17.7 18.6 36.9 37 50.6 18.4 13.6 41.1 23 62.5 27.7-26.7-2.7-48-6.6-64.9-10.4Z"
        fill="currentColor"
        opacity=".86"
      />
      <path
        d="M27 33c2.5 28.2 27.9 59.6 64.9 78.2 28.1 14.2 62.6 21.2 96.4 19.2-24.9 10.8-58 13-88.5 5.6-45.9-11.1-80.4-43.9-86.9-82.9-.9-5.1-1.1-10-.9-15.1 2.4-2 8.5-3.6 15-5Z"
        fill="currentColor"
      />
      <path
        d="M228 31.8c-.2 5-.8 10.1-1.7 15.2-6.8 39-41.4 71.7-87.2 82.7-16.8 4-34.4 4.7-50.9 2.1 25.7-3.8 52.3-11.7 76.6-23.3 31.8-15.2 55.7-38.6 63.2-62.9Z"
        fill="currentColor"
      />
      <path
        d="M67 54h37.5c3.2 0 6.1-2.1 7-5.2l6-20.1c.8-2.8 4.8-2.9 5.7-.1l10.6 35.4c.9 3.1 5.3 3 6.1-.1l12.7-47.2c.8-3 5.1-3.1 6-.2l13.7 42.3c1 3 4.8 4.2 7.4 2.3l8.7-6.5c1.2-.9 2.6-1.4 4.1-1.4H210"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

export function RNestMark({ className, title = "RNest" }: RNestLogoProps) {
  return (
    <svg viewBox="0 0 240 140" fill="none" role="img" aria-label={title} className={cn("text-[#161616]", className)}>
      <RNestGlyphPaths />
    </svg>
  );
}

export function RNestLogo({ className, title = "RNest" }: RNestLogoProps) {
  return (
    <svg viewBox="0 0 400 120" fill="none" role="img" aria-label={title} className={cn("text-[#161616]", className)}>
      <g transform="translate(95 -4) scale(0.92)">
        <RNestGlyphPaths />
      </g>
    </svg>
  );
}
