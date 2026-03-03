"use client";

export function ShopBrandLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 92" aria-label="RNest" role="img" className={className}>
      <text x="4" y="70" fill="#193e7a" fontSize="74" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif">
        R
      </text>
      <path
        d="M88 59H118L138 59L150 34L165 78L179 16L194 70L210 59H232"
        fill="none"
        stroke="#193e7a"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="98" y="70" fill="#193e7a" fontSize="74" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif">
        N
      </text>
      <text x="204" y="70" fill="#9bc8c9" fontSize="74" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif">
        est
      </text>
    </svg>
  );
}

export default ShopBrandLogo;
