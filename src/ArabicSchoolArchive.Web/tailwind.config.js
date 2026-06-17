/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /* ─────────────────────────────────────────────────────────────
       * Color tokens
       * Hijazi Cream base + Date Palm + Diriyah Tan + Ink Navy + Oud.
       * The rule: 70% warm neutrals · 20% deep green/navy · 10% tan/maroon.
       * Surfaces are now intentionally stepped: cream → paper → surface →
       * surface-muted → surface-sunken, so the eye can read depth.
       * ─────────────────────────────────────────────────────────── */
      colors: {
        // Canvas / page
        canvas: "#F4ECDB",            // Deepest cream — page background
        cream: "#F6F1E7",             // Base cream (alias of canvas-ish)
        "cream-soft": "#EFE6D2",      // Slightly deeper cream for shells

        // Surfaces (strong step)
        paper: "#FFFBF1",             // Card / surface
        surface: "#FFFDF8",           // Alias
        "surface-muted": "#F1E8D2",   // Filter / input resting fill
        "surface-sunken": "#E7DBBF",   // Inset wells
        "surface-strong": "#DCC8A6",  // Stone Beige — used sparingly

        // Borders
        border: "#D9C9A5",            // Default border, visible
        "border-soft": "#E4D6B5",     // Subtle divider
        "border-strong": "#BFA776",   // Strong / active border
        "border-deep": "#A98A52",     // Deepest border (rare)

        // Text / graph / icon — Ink Navy
        ink: {
          DEFAULT: "#0F2236",
          strong: "#08172A",
          muted: "#3F5468",
          soft: "#7A7363",
        },

        // Brand — Date Palm Green (primary action / brand identity)
        palm: {
          DEFAULT: "#0E5A46",
          50: "#E6F0EB",
          100: "#C7DDD0",
          200: "#9CC4AE",
          300: "#6CA486",
          400: "#3F8067",
          500: "#0E5A46",
          600: "#0A4636",
          700: "#073527",
          800: "#05241B",
          900: "#03170F",
        },

        // Diriyah Tan — accent / highlight (used as solid, not as decoration)
        tan: {
          DEFAULT: "#C8A46A",
          50: "#F5ECDA",
          100: "#E8D4A8",
          200: "#D8B97A",
          300: "#C8A46A",
          400: "#B58A48",
          500: "#9A7138",
          600: "#7A5828",
          700: "#5C4120",
        },

        // Ink Navy (graph / detail / chrome)
        navy: {
          DEFAULT: "#11314A",
          50: "#E4ECF2",
          100: "#C0D2DE",
          200: "#93B0C4",
          300: "#6790A8",
          400: "#3F708D",
          500: "#11314A",
          600: "#0E2A40",
          700: "#0B2236",
          800: "#081A2A",
          900: "#05121D",
        },

        // Oud Brown (supporting tone)
        oud: {
          DEFAULT: "#5C4532",
          50: "#EDE5D8",
          100: "#D7C5A8",
          200: "#B59876",
          300: "#8A6F58",
          400: "#6E5742",
          500: "#5C4532",
          600: "#483522",
          700: "#342517",
        },

        // Sadu Maroon (rare — destructive / formal moments)
        maroon: {
          DEFAULT: "#7A2E2E",
          50: "#F2E2E2",
          100: "#DDB6B6",
          200: "#B87B7B",
          300: "#9A5454",
          400: "#7A2E2E",
          500: "#5F2222",
          600: "#451818",
        },

        // Warm Gray (muted text/border)
        warm: {
          DEFAULT: "#8A847B",
          50: "#EFECE6",
          100: "#DCD6CB",
          200: "#BDB5A6",
          300: "#A39887",
          400: "#8A847B",
          500: "#6F6A62",
          600: "#54514B",
        },

        // Status semantics — grounded in the new palette
        success: {
          DEFAULT: "#0E5A46",
          50: "#E6F0EB",
          100: "#C7DDD0",
          500: "#0E5A46",
          600: "#0A4636",
          700: "#073527",
        },
        warning: {
          DEFAULT: "#9A7138",
          50: "#F5ECDA",
          100: "#E8D4A8",
          500: "#9A7138",
          600: "#7A5828",
          700: "#5C4120",
        },
        danger: {
          DEFAULT: "#7A2E2E",
          50: "#F2E2E2",
          100: "#DDB6B6",
          500: "#7A2E2E",
          600: "#5F2222",
          700: "#451818",
        },
        info: {
          DEFAULT: "#11314A",
          50: "#E4ECF2",
          100: "#C0D2DE",
          500: "#11314A",
          600: "#0E2A40",
          700: "#0B2236",
        },
      },

      /* ─────────────────────────────────────────────────────────────
       * Typography
       *  - display : "Saudi" (H1/H2 hero moments) — falls back gracefully
       *  - body    : IBM Plex Sans Arabic (UI / paragraphs)
       *  - kufi    : Noto Kufi Arabic (small geometric section labels)
       *  - mono    : LTR-only mono for IDs / hashes
       * ─────────────────────────────────────────────────────────── */
      fontFamily: {
        sans: [
          '"IBM Plex Sans Arabic"',
          '"Noto Kufi Arabic"',
          '"Tajawal"',
          '"Cairo"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        display: [
          '"Saudi"',
          '"Al-Awwal"',
          '"IBM Plex Sans Arabic"',
          '"Tajawal"',
          '"Cairo"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        kufi: [
          '"Noto Kufi Arabic"',
          '"IBM Plex Sans Arabic"',
          '"Tajawal"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"IBM Plex Mono"',
          '"JetBrains Mono"',
          'SFMono-Regular',
          'Cascadia Mono',
          'Roboto Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        "display-2xl": ["3.75rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-xl":  ["3rem",    { lineHeight: "1.08", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg":  ["2.5rem",  { lineHeight: "1.12", letterSpacing: "-0.015em", fontWeight: "700" }],
        "display-md":  ["2rem",    { lineHeight: "1.18", letterSpacing: "-0.01em", fontWeight: "700" }],
        "display-sm":  ["1.5rem",  { lineHeight: "1.25", letterSpacing: "-0.005em", fontWeight: "700" }],
        "title":       ["1.125rem",{ lineHeight: "1.35", letterSpacing: "0", fontWeight: "600" }],
        "body":        ["0.9375rem",{ lineHeight: "1.55", letterSpacing: "0", fontWeight: "400" }],
        "small":       ["0.8125rem",{ lineHeight: "1.45", letterSpacing: "0", fontWeight: "400" }],
        "caption":     ["0.75rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "500" }],
        "kicker":      ["0.6875rem",{ lineHeight: "1.2", letterSpacing: "0.22em", fontWeight: "600" }],
      },

      /* ─────────────────────────────────────────────────────────────
       * Radii
       * ─────────────────────────────────────────────────────────── */
      borderRadius: {
        none: "0px",
        xs:   "3px",
        sm:   "5px",
        md:   "8px",
        lg:   "12px",
        xl:   "14px",
        "2xl":"18px",
        "3xl":"22px",
        full: "9999px",
      },

      /* ─────────────────────────────────────────────────────────────
       * Shadows — warm, low-spread, low-opacity, strong-on-hover
       * ─────────────────────────────────────────────────────────── */
      boxShadow: {
        "xs":      "0 1px 2px 0 rgba(15, 34, 54, 0.06)",
        "card":    "0 1px 0 0 rgba(15, 34, 54, 0.04), 0 1px 2px 0 rgba(15, 34, 54, 0.05), 0 4px 12px -4px rgba(15, 34, 54, 0.04)",
        "lift":    "0 2px 4px 0 rgba(15, 34, 54, 0.05), 0 12px 24px -8px rgba(15, 34, 54, 0.10)",
        "pop":     "0 4px 8px -2px rgba(15, 34, 54, 0.08), 0 24px 48px -12px rgba(15, 34, 54, 0.18)",
        "inset":   "inset 0 1px 0 0 rgba(255, 253, 248, 0.6)",
        "focus":   "0 0 0 3px rgba(14, 90, 70, 0.28)",
        "tan":     "0 1px 0 0 rgba(200, 164, 106, 0.45), 0 2px 4px -1px rgba(200, 164, 106, 0.25)",
        "palm":    "0 4px 12px -4px rgba(14, 90, 70, 0.45), 0 1px 0 0 rgba(14, 90, 70, 0.10)",
        "rail-l":  "inset 1px 0 0 0 rgba(15, 34, 54, 0.05)",
        "rail-r":  "inset -1px 0 0 0 rgba(15, 34, 54, 0.05)",
      },

      /* ─────────────────────────────────────────────────────────────
       * Spacing — extended to keep the grid disciplined
       * ─────────────────────────────────────────────────────────── */
      spacing: {
        18: "4.5rem",
        88: "22rem",
        100: "25rem",
        112: "28rem",
        128: "32rem",
        144: "36rem",
      },
      maxWidth: {
        "container": "1200px",
        "wide":      "1320px",
        "content":   "720px",
      },

      /* ─────────────────────────────────────────────────────────────
       * Motion tokens — single easing, refined durations
       * ─────────────────────────────────────────────────────────── */
      transitionTimingFunction: {
        "out-expo":    "cubic-bezier(0.22, 1, 0.36, 1)",
        "in-out-expo": "cubic-bezier(0.83, 0, 0.17, 1)",
      },
      transitionDuration: {
        140: "140ms",
        180: "180ms",
        220: "220ms",
        260: "260ms",
        320: "320ms",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-soft": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in":      "fade-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in-soft": "fade-in-soft 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in":     "scale-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in":     "slide-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-soft":   "pulse-soft 2.4s ease-in-out infinite",
        "shimmer":      "shimmer 1.8s linear infinite",
      },

      /* ─────────────────────────────────────────────────────────────
       * Backgrounds
       * ─────────────────────────────────────────────────────────── */
      backgroundImage: {
        "sand-grain":
          "radial-gradient(1400px 700px at 100% -10%, rgba(200, 164, 106, 0.10), transparent 60%), radial-gradient(900px 500px at -10% 110%, rgba(14, 90, 70, 0.06), transparent 60%)",
        "saudi-pattern":
          "radial-gradient(circle at 1px 1px, rgba(15, 34, 54, 0.06) 1px, transparent 0)",
        "warm-divider":
          "linear-gradient(90deg, transparent 0%, rgba(200, 164, 106, 0.7) 50%, transparent 100%)",
        "ink-divider":
          "linear-gradient(90deg, transparent 0%, rgba(15, 34, 54, 0.18) 50%, transparent 100%)",
        "palm-fade":
          "linear-gradient(135deg, #0E5A46 0%, #0A4636 100%)",
        "ink-fade":
          "linear-gradient(135deg, #11314A 0%, #08172A 100%)",
        "tan-fade":
          "linear-gradient(135deg, #C8A46A 0%, #9A7138 100%)",
        "skeleton":
          "linear-gradient(90deg, rgba(15, 34, 54, 0.04) 0%, rgba(15, 34, 54, 0.10) 50%, rgba(15, 34, 54, 0.04) 100%)",
      },
      backgroundSize: {
        "saudi-pattern": "20px 20px",
        "skeleton": "200% 100%",
      },
    },
  },
  plugins: [],
};
