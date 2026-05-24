/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#6366f1",
        gray: {
          950: "#0a0a0f",
        },
      },
    },
  },
  plugins: [],
};
