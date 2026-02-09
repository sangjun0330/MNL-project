import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        "apple": "0 10px 30px rgba(0,0,0,0.06)",
        "apple-sm": "0 6px 16px rgba(0,0,0,0.06)",
        "apple-lg": "0 20px 60px rgba(0,0,0,0.10)",
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
      },
      transitionTimingFunction: {
        "apple": "cubic-bezier(0.22, 1, 0.36, 1)",
        "spring": "cubic-bezier(0.175, 0.885, 0.32, 1.1)",
        "bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "decel": "cubic-bezier(0, 0, 0.2, 1)",
      },
      transitionDuration: {
        "micro": "120ms",
        "fast": "180ms",
        "med": "300ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translate3d(0, 12px, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "press": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.96)" },
        },
      },
      animation: {
        "fade-in": "fade-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in-up": "fade-in-up 400ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 300ms cubic-bezier(0.175, 0.885, 0.32, 1.1) both",
        "press": "press 120ms cubic-bezier(0.175, 0.885, 0.32, 1.1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
