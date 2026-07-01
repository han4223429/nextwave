module.exports = {
    content: [
        './index.html',
        './i18n.js',
        './script.js',
        './three-hero.js'
    ],
    theme: {
        extend: {
            colors: {
                brand: { DEFAULT: '#5b6cff', dark: '#4338ca', light: '#eef0ff' },
                accent: '#ff6b6b',
                mint: '#18c29c',
                amber: '#ffb020',
                ink: '#1a1c2e',
                muted: '#5b6178'
            },
            fontFamily: {
                sans: ['Pretendard Variable', 'Pretendard', '-apple-system', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace']
            },
            borderRadius: { '4xl': '2rem' }
        }
    }
};
