/** @type {import('tailwindcss').Config} */
// Canonical Vura design tokens. Keep all colors semantic so surfaces stay
// consistent across storefront and Studio. 500 is the brand purple.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vura: {
          50:  '#f3f1ff', // soft tint surfaces (loaders, chips)
          100: '#ebe5ff',
          200: '#d6cdff',
          300: '#aaa0ff', // muted accent text on dark backgrounds
          400: '#7f6aff',
          500: '#5b2cff', // canonical brand purple
          600: '#4b1fe5', // hover state
          700: '#3518b9', // pressed / deep CTA
          800: '#2a148f',
          900: '#21154d', // deepest brand ink for badges
        },
        ink: {
          50:  '#f7f8fc', // page background
          100: '#eef0f6',
          200: '#dde0e9',
          300: '#7c8495', // muted body text
          400: '#5f6678',
          500: '#3a3f55',
          600: '#17182a', // headings
          700: '#0f111e',
          900: '#080a12', // Studio canvas
        },
      },
      boxShadow: {
        vura: '0 24px 60px rgba(91, 44, 255, .15)',
        'vura-sm': '0 10px 30px rgba(91, 44, 255, .12)',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
