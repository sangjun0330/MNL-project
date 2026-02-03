import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        "apple": "0 10px 30px rgba(0,0,0,0.06)",
        "apple-sm": "0 6px 16px rgba(0,0,0,0.06)",
      },
      borderRadius: {
        "apple": "20px",
      },
      colors: {
        "ios-bg": "#F5F5F7",
        "ios-card": "#FFFFFF",
        "ios-sep": "rgba(0,0,0,0.08)",
        "ios-text": "rgba(0,0,0,0.92)",
        "ios-sub": "rgba(0,0,0,0.60)",
        // legacy alias used across components
        "ios-muted": "rgba(0,0,0,0.60)",
      }
    },
  },
  plugins: [],
} satisfies Config;
