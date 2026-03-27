import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        soc: {
          bg: "#070d18",
          panel: "#0f172a",
          panelSoft: "#111c2f",
          critical: "#ef4444",
          high: "#f97316",
          medium: "#facc15",
        },
      },
    },
  },
  plugins: [],
};

export default config;
