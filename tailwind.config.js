/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#14213D',
          light: '#1E2E52',
          lighter: '#2A3B63',
        },
        gold: {
          DEFAULT: '#D4AF37',
          deep: '#8A6A1F',
        },
        cream: '#F6F3EA',
        card: '#FBFAF5',
        rule: '#E2DCCB',
        ink: '#3F4A5A',
        muted: '#5A6372',
      },
      fontFamily: {
        serif: ['"Libre Baskerville"', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 33, 61, 0.06)',
        sheet: '0 -8px 24px rgba(20, 33, 61, 0.16)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 240ms ease-out both',
        'sheet-up': 'sheet-up 220ms ease-out both',
      },
    },
  },
  plugins: [],
};
