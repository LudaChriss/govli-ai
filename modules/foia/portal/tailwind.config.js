/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-navy': '#1B3A5C',
        'brand-teal': '#0D7C8C',
        'brand-gold': '#C8992A',
        'navy': {
          50: '#f5f7fa',
          100: '#ebeef3',
          200: '#d2dae6',
          300: '#aab8d0',
          400: '#7c92b5',
          500: '#5a729d',
          600: '#465983',
          700: '#39496b',
          800: '#1B3A5C',
          900: '#16304d',
        },
        'teal': {
          50: '#f0fafb',
          100: '#d9f2f4',
          200: '#b8e6eb',
          300: '#87d4dd',
          400: '#4eb8c7',
          500: '#0D7C8C',
          600: '#0b6978',
          700: '#0d5662',
          800: '#104651',
          900: '#123b44',
        },
        'gold': {
          50: '#fdfaf3',
          100: '#faf3e0',
          200: '#f5e5c0',
          300: '#eed196',
          400: '#e5b85f',
          500: '#C8992A',
          600: '#b8881f',
          700: '#98701a',
          800: '#7d5b1a',
          900: '#694b1a',
        },
      },
    },
  },
  plugins: [],
}
