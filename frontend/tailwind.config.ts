import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'su-900': '#002147',
        'su-700': '#003d7a',
        'su-500': '#0057A8',
        'su-300': '#4d9de0',
        'su-100': '#dbeeff',
        'su-50':  '#f0f7ff',
      },
      borderRadius: {
        'glass': '28px',
      },
      backdropBlur: {
        'glass': '24px',
      },
      boxShadow: {
        'glass':       '0 8px 32px rgba(0,33,71,0.18)',
        'glass-hover': '0 12px 40px rgba(0,33,71,0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(12px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
