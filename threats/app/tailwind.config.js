/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      colors: {
        bg: '#000000',
        fg: '#ffffff',
        dim: '#666666',
        accent: '#ffffff',
        line: '#1a1a1a',
        panel: '#0a0a0a',
        crit: '#ff3b30',
        high: '#ff9500',
        med: '#ffcc00',
        low: '#666666'
      },
      letterSpacing: {
        wider2: '0.08em',
        widest2: '0.16em'
      },
      animation: {
        blink: 'blink 1.2s step-end infinite',
        scan: 'scan 6s linear infinite'
      },
      keyframes: {
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        scan: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '0 100%' } }
      }
    }
  },
  plugins: []
};
