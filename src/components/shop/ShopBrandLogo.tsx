"use client";

export function ShopBrandLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 78" aria-label="RNest" role="img" className={className}>
      <text x="3" y="60" fill="#214b91" fontSize="62" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif">
        R
      </text>
      <path
        d="M58 48H84C88 48 91 46 93 43C96 39 99 37 103 37C107 37 110 40 113 45C116 49 119 52 123 52H128L141 18L154 63L168 11L181 55L191 48H200"
        fill="none"
        stroke="#214b91"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="171" y="60" fill="#a7cfd0" fontSize="62" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif">
        est
      </text>
    </svg>
  );
}

export default ShopBrandLogo;
