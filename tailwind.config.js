/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0a1628',
          800: '#0f2044',
          700: '#162a56',
          600: '#1a3266',
        },
        brand: {
          blue: '#1e56b0',
          purple: '#4c3bcf',
        },
        // Legacy aliases for backwards compatibility
        'ocean-dark': '#0a1628',
        'ocean-blue': '#0f2044',
        'ocean-light': '#162a56',
        'cyan-bright': '#1e56b0',
        'blue-bright': '#1e56b0',
      },
    },
  },
  plugins: [],
}
