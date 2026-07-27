/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f0f2f8",
          100: "#dde2ee",
          400: "#5b6b93",
          600: "#334169",
          900: "#1b2544", // primary dark ink
        },
        paper: "#faf7f0", // warm off-white "notebook page"
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
