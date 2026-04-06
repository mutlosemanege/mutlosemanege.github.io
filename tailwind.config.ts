import type { Config } from 'tailwindcss'

export default <Config>{
  content: [
    './app/components/**/*.{vue,ts}',
    './app/composables/**/*.ts',
    './app/pages/**/*.{vue,ts}',
    './app/app.vue',
  ],
  theme: {
    extend: {
      colors: {
        base: '#0B1020',
        surface: '#12192B',
        'surface-secondary': '#1A2236',
        'surface-elevated': '#1F2A42',
        accent: {
          purple: '#8B6CFF',
          'purple-soft': '#B7A2FF',
          blue: '#6CB8FF',
          green: '#8DFFB5',
          pink: '#F6C1E7',
        },
        'text-primary': '#F5F7FF',
        'text-secondary': '#A7B0C5',
        'text-muted': '#6B7A99',
        'border-subtle': 'rgba(255,255,255,0.08)',
        'border-medium': 'rgba(255,255,255,0.12)',
        'border-strong': 'rgba(255,255,255,0.20)',
        priority: {
          critical: '#FF6B8A',
          high: '#FFB06B',
          medium: '#FFD66B',
          low: '#8DFFB5',
        },
        status: {
          todo: '#A7B0C5',
          scheduled: '#6CB8FF',
          'in-progress': '#B7A2FF',
          done: '#8DFFB5',
          missed: '#FF6B8A',
        },
        primary: {
          50: '#1D2440',
          100: '#252E52',
          200: '#313D69',
          300: '#46578D',
          400: '#6074B5',
          500: '#8B6CFF',
          600: '#7A60E6',
          700: '#6952C7',
          800: '#4F3E96',
          900: '#312757',
        },
      },
      borderRadius: {
        glass: '20px',
        'glass-lg': '24px',
        'glass-xl': '32px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glass-hover': '0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        'glow-purple': '0 0 20px rgba(139,108,255,0.15), 0 0 60px rgba(139,108,255,0.05)',
        'glow-blue': '0 0 20px rgba(108,184,255,0.15), 0 0 60px rgba(108,184,255,0.05)',
        'glow-green': '0 0 20px rgba(141,255,181,0.15), 0 0 60px rgba(141,255,181,0.05)',
      },
      backdropBlur: {
        glass: '16px',
        'glass-heavy': '24px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
