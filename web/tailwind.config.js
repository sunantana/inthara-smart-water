/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff9ff',
          100: '#dcf1ff',
          500: '#0e8fd6',
          600: '#0a72ad',
          700: '#0b5c8a',
        },
      },
    },
  },
  plugins: [],
};
