/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm, low-light bar palette — charcoal room, amber under the optics.
        ink: {
          900: '#0f1113',
          800: '#16191c',
          700: '#1e2227',
          600: '#282d33',
          500: '#363c44',
        },
        chalk: {
          100: '#f4f1ea',
          300: '#cfc9bd',
          500: '#8f897c',
        },
        amber: {
          400: '#f0b429',
          500: '#e09b0d',
          600: '#b97e0a',
        },
        pour: {
          green: '#3fb57f',
          red: '#e5604d',
          blue: '#5b8def',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        rail: '0 1px 0 0 rgba(255,255,255,0.03), 0 12px 30px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        'slide-up': 'slide-up 0.28s ease-out',
        'pop-in': 'pop-in 0.16s ease-out',
      },
    },
  },
  plugins: [],
};
