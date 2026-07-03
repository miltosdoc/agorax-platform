import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ["GFS Didot", "Georgia", "Times New Roman", "serif"],
        display: ["GFS Didot", "Georgia", "Times New Roman", "serif"],
        mono: ["IBM Plex Mono", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 1px)",
        sm: "max(2px, calc(var(--radius) - 2px))",
      },
      colors: {
        /* ── AgoraX named palette (design-system tokens) ── */
        paper: "var(--paper)",
        surface: "var(--surface)",
        sunken: "var(--sunken)",
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)", faint: "var(--ink-faint)" },
        kyanos: { DEFAULT: "var(--kyanos)", deep: "var(--kyanos-deep)", wash: "var(--kyanos-wash)" },
        yper: { DEFAULT: "var(--yper)", wash: "var(--yper-wash)" },
        kata: { DEFAULT: "var(--kata)", wash: "var(--kata-wash)" },
        apochi: { DEFAULT: "var(--apochi)", wash: "var(--apochi-wash)" },
        warn: { DEFAULT: "var(--warn)", wash: "var(--warn-wash)" },
        bronze: { DEFAULT: "var(--bronze)", deep: "var(--bronze-deep)", wash: "var(--bronze-wash)" },
        bc: {
          ground: "var(--bc-ground)", panel: "var(--bc-panel)", line: "var(--bc-line)",
          "ink": "var(--bc-ink)", "ink-soft": "var(--bc-ink-soft)",
          yper: "var(--bc-yper)", kata: "var(--bc-kata)", apochi: "var(--bc-apochi)", live: "var(--bc-live)",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
