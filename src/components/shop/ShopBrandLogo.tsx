"use client";

export function ShopBrandLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 92" aria-label="RNest" role="img" className={className}>
      <text x="2" y="69" fill="#1f4a8c" fontSize="72" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif">
        R
      </text>
      <path
        d="M86 58H108C113 58 117 56 120 53C123 50 126 48 130 48C135 48 138 52 141 56C144 60 147 64 151 64H155L171 24L186 79L203 16L220 66L231 58H248"
        fill="none"
        stroke="#1f4a8c"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="212" y="69" fill="#a8cfd0" fontSize="72" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif">
        est
      </text>
    </svg>
  );
}

export default ShopBrandLogo;
