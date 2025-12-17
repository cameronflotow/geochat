/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./hooks/**/*.{js,ts,jsx,tsx,mdx}", // Just in case
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
            },
            keyframes: {
                'pulse-glow': {
                    '0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(168,85,247,0.6)' },
                    '50%': { opacity: 0.8, boxShadow: '0 0 10px rgba(168,85,247,0.3)' },
                },
                'pulse-slow': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 0.3 },
                    '50%': { transform: 'scale(1.1)', opacity: 0.5 },
                },
                'glow': {
                    '0%, 100%': { filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.8))' },
                    '50%': { filter: 'drop-shadow(0 0 15px rgba(255,255,255,1))' },
                }
            },
            animation: {
                'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
                'glow': 'glow 2s ease-in-out infinite',
            }
        },
    },
    plugins: [],
};
