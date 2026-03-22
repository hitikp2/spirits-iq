import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#F5A623",
          50: "#FEF6E7",
          100: "#FDEDD0",
          200: "#FBDBA1",
          300: "#F9C972",
          400: "#F7B74A",
          500: "#F5A623",
          600: "#C4841A",
          700: "#936312",
          800: "#62420C",
          900: "#312106",
        },
        surface: {
          DEFAULT: "#101018",
          50: "#F5F5F8",
          100: "#E8E8F0",
          200: "#D0D0E0",
          300: "#9999B0",
          400: "#5A5A70",
          500: "#353548",
          600: "#252535",
          700: "#1C1C28",
          800: "#161620",
          900: "#101018",
          950: "#08080D",
        },
        success: { DEFAULT: "#34D399", dark: "#059669" },
        danger: { DEFAULT: "#F87171", dark: "#DC2626" },
        info: { DEFAULT: "#60A5FA", dark: "#2563EB" },
        accent: { DEFAULT: "#A78BFA", dark: "#7C3AED" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "slide-left": "slideLeft 0.3s ease-out",
        pulse: "pulse 2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideDown: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(0)" } },
        slideLeft: { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } },
        pulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
    },
  },
  plugins: [],
};

export default config;
