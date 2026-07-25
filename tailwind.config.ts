import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f4efe7",
        ink: "#201713",
        mist: "#f9f6f1",
        sand: "#dccbb8",
        rose: "#f4c7bb",
        sage: "#c8d8c4",
        ocean: "#b7d8e8"
      },
      fontFamily: {
        display: ["Georgia", "ui-serif", "serif"],
        body: ["'Avenir Next'", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 20px 60px rgba(32, 23, 19, 0.12)"
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at top, rgba(255,255,255,0.7), transparent 38%), linear-gradient(135deg, rgba(244,199,187,0.32), rgba(183,216,232,0.15) 45%, rgba(200,216,196,0.3))"
      }
    }
  },
  plugins: []
};

export default config;
