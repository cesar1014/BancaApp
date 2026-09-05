import type { Config } from 'tailwindcss';

/**
 * Design system "Placar".
 *
 * Mobile-first, KPI heroico, energia controlada. Carvão levemente quente e
 * UM acento lima usado como superfície — não só como texto. Lucro e acento são
 * a mesma cor: o dinheiro é a identidade do produto.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
        sunken: 'rgb(var(--c-sunken) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--c-ink-faint) / <alpha-value>)',
        'ink-invert': 'rgb(var(--c-ink-invert) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-deep': 'rgb(var(--c-accent-deep) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        // Lucro = acento. Um acento, um negativo, um alerta — nada de arco-íris.
        positive: 'rgb(var(--c-positive) / <alpha-value>)',
        negative: 'rgb(var(--c-negative) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        neutral: 'rgb(var(--c-neutral) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          'Segoe UI Variable',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'Cascadia Mono', 'Segoe UI Mono', 'Consolas', 'monospace'],
      },
      /**
       * Escala com contraste violento: rótulos minúsculos em caixa-alta,
       * números-âncora enormes, poucos degraus intermediários.
       */
      fontSize: {
        '2xs': ['0.656rem', { lineHeight: '1.2', letterSpacing: '0.16em' }], // 10,5px — rótulo
        badge: ['0.625rem', { lineHeight: '1.4', letterSpacing: '0.1em' }], // 10px — placar
        'num-md': ['1rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        'num-lg': ['1.4375rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'num-xl': ['2rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
        hero: ['2.875rem', { lineHeight: '0.92', letterSpacing: '-0.045em' }], // 46px
        'hero-lg': ['4.375rem', { lineHeight: '0.92', letterSpacing: '-0.045em' }], // 70px
      },
      fontWeight: {
        650: '650',
        750: '750',
      },
      borderRadius: {
        sm: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 0 rgb(255 255 255 / 0.035) inset, 0 2px 6px -2px rgb(0 0 0 / 0.55)',
        raised: '0 1px 0 rgb(255 255 255 / 0.05) inset, 0 14px 36px -18px rgb(0 0 0 / 0.85)',
        hero:
          '0 18px 44px -20px rgb(var(--c-accent) / 0.45), 0 2px 0 rgb(255 255 255 / 0.18) inset',
        glow: '0 10px 24px -12px rgb(var(--c-accent) / 0.8)',
        pop: '0 32px 80px -24px rgb(0 0 0 / 0.85), 0 0 0 1px rgb(255 255 255 / 0.06)',
      },
      spacing: {
        tab: '4.5rem', // altura reservada para a barra inferior no mobile
        'safe-b': 'env(safe-area-inset-bottom)',
      },
      transitionTimingFunction: {
        placar: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'page-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'none' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'page-in': 'page-in 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-in': 'pop-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-in': 'toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
      backdropBlur: {
        bar: '20px',
      },
    },
  },
  plugins: [],
};

export default config;
