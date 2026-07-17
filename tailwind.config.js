/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}', './*.html', './admin-dashboard.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#111111',
          hover: '#2a2a2a',
          muted: '#767676',
          bg: '#ffffff',
          light: '#f9f9f9',
          gold: '#c5a880',
        }
      },
      letterSpacing: {
        premium: '0.08em',
        wide: '0.15em',
      }
    },
  },
  plugins: [],
}