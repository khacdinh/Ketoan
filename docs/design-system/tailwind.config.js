/** Tailwind CSS v3: gộp vào tailwind.config.js (theme.extend). Tên màu dùng như bg-paper, text-ink, border-rule… */
module.exports = {
  theme: {
    extend: {
      fontFamily: { sans: ['"Archivo Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'] },
      colors: {
        paper: '#ECEAE5', sheet: '#FDFDFB', surface: '#F4F2EC', head: '#E8E0CB',
        ink: { DEFAULT: '#25282D', 2: '#4A4F56', 3: '#5A5F66' },
        rule: { DEFAULT: '#D9D6CD', 2: '#C2BEB2' }, field: '#8E8B83',
        cover: { DEFAULT: '#3E4248', 2: '#33373C', ink: '#F1EEE6', 'ink-2': '#BDB8AA' },
        neutral: { 100: '#F4F2EC', 200: '#E8E5DD', 300: '#D9D6CD', 400: '#C2BEB2', 500: '#8E8B83', 600: '#5A5F66', 700: '#4A4F56', 800: '#34383E', 900: '#25282D' },
        accent: { 100: '#F6F0DD', 200: '#EBDFBC', 300: '#DDCB96', 400: '#CDB26A', 500: '#B8963F', 600: '#8F7230', 700: '#705A26', 800: '#50411B', 900: '#25282D' },
        pen: { DEFAULT: '#7A5F22', hover: '#5F4A19', soft: '#F6F0DD' },
        alert: { DEFAULT: '#B3261E', soft: '#F8E6E0' },
        caution: { DEFAULT: '#7A5A12', soft: '#F3E7C4' },
        income: { DEFAULT: '#1D6B47', soft: '#E0EBDD' },
        highlight: '#F1E6BF',
        chart: { 1: '#A57A12', 2: '#2E6DAA', 3: '#6E8B2B', other: '#8E8B83' },
      },
      borderRadius: { none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0' },
      boxShadow: {
        sm: '0 1px 2px rgb(43 43 45 / .14)',
        md: '0 3px 10px rgb(43 43 45 / .16)',
        lg: '0 12px 32px rgb(43 43 45 / .22)',
      },
    },
  },
};
