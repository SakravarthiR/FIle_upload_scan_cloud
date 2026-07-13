/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream:     '#F4ECD8',
        parchment: '#EDE0C8',
        aged:      '#E3D5B8',
        sepia:     '#3E2C1C',
        'sepia-light': '#6B4C35',
        mustard:   '#C9A227',
        'mustard-dark': '#A07E15',
        olive:     '#5F7161',
        'olive-dark': '#4A5A4B',
        brick:     '#A6432D',
        'brick-dark': '#7D2F1E',
        sage:      '#7C9070',
        'sage-dark': '#5E7255',
        'stamp-pending': '#8B7355',
        'stamp-unknown': '#B8751A',
        border:    '#C4A882',
        'border-dark': '#8B7355',
      },
      fontFamily: {
        typewriter: ['"Special Elite"', '"Courier New"', 'monospace'],
        courier:    ['"Courier Prime"', '"Courier New"', 'monospace'],
        serif:      ['"Libre Baskerville"', 'Georgia', 'serif'],
        display:    ['"Playfair Display"', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'paper-texture': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        'stamp-press': {
          '0%':   { transform: 'scale(0.4) rotate(-15deg)', opacity: '0' },
          '55%':  { transform: 'scale(1.15) rotate(3deg)',  opacity: '1' },
          '75%':  { transform: 'scale(0.95) rotate(-1deg)' },
          '100%': { transform: 'scale(1) rotate(2deg)',     opacity: '1' },
        },
        'telegram-in': {
          '0%':   { transform: 'translateX(120%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        'telegram-out': {
          '0%':   { transform: 'translateX(0)',     opacity: '1' },
          '100%': { transform: 'translateX(120%)', opacity: '0' },
        },
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'stamp-press':  'stamp-press 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards',
        'telegram-in':  'telegram-in 0.35s ease-out forwards',
        'telegram-out': 'telegram-out 0.3s ease-in forwards',
        'fade-in':      'fade-in 0.4s ease-out forwards',
        'shimmer':      'shimmer 2s linear infinite',
      },
      boxShadow: {
        'paper':   '2px 3px 8px rgba(62, 44, 28, 0.18), 0 1px 3px rgba(62, 44, 28, 0.1)',
        'card':    '3px 4px 12px rgba(62, 44, 28, 0.22), 1px 1px 4px rgba(62, 44, 28, 0.08)',
        'stamp':   'inset 0 0 0 2px currentColor',
        'inset-sm':'inset 0 1px 3px rgba(62, 44, 28, 0.2)',
      },
    },
  },
  plugins: [],
};
