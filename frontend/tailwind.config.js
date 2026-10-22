/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f0f2f8",
          100: "#dde2ee",
          200: "#c2cce0",
          400: "#5b6b93",
          600: "#334169",
          800: "#222c4a",
          900: "#1b2544", // primary dark ink
          950: "#0e1320", // ultra dark ink for night canvas
        },
        paper: "#faf7f0", // warm off-white "notebook page"
        "paper-dark": "#131a2c", // warm midnight paper for dark mode
        highlight: "#f5b942", // amber highlighter accent
        sage: "#7c9885", // success / correct-answer green
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
