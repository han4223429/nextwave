// NextWave Entrepreneurship Club - Main Script

// ===========================
// Real-time System Monitor
// ===========================
function updateMonitor() {
    const cpu = Math.floor(Math.random() * 30) + 20; // 20-50%
    const mem = (Math.random() * 2 + 15).toFixed(1); // 15-17GB
    const tx = (Math.random() * 5).toFixed(1);
    const rx = (Math.random() * 5).toFixed(1);

    const cpuVal = document.getElementById('cpu-val');
    const memVal = document.getElementById('mem-val');
    const netTx = document.getElementById('net-tx');
    const netRx = document.getElementById('net-rx');
    const cpuBar = document.getElementById('cpu-bar');

    if (cpuVal) cpuVal.innerText = cpu + '%';
    if (memVal) memVal.innerText = mem + 'GB';
    if (netTx) netTx.innerText = tx + 'Mb/s';
    if (netRx) netRx.innerText = rx + 'Mb/s';

    // Update CPU Bar with block symbols
    if (cpuBar) {
        const blocks = Math.floor(cpu / 10);
        cpuBar.innerText = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
    }
}

// ===========================
// Uptime Counter
// ===========================
let uptime = 0; // Starting uptime in seconds
function updateUptime() {
    uptime++;
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const formatted = `${d.toString().padStart(2, '0')}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    const el = document.getElementById('uptime-val');
    if (el) el.innerText = formatted;
}

setInterval(updateMonitor, 2000);
setInterval(updateUptime, 1000);

// ===========================
// Active Navigation on Scroll
// ===========================
const sections = document.querySelectorAll('section[id], footer[id]');
const navLinks = document.querySelectorAll('.nav-link');

const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navLinks.forEach(link => {
                link.classList.remove('nav-link-active');
                if (link.getAttribute('href') === `#${id}`) {
                    link.classList.add('nav-link-active');
                }
            });
        }
    });
}, observerOptions);

// ===========================
// Mobile Menu Toggle
// ===========================
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenuClose = document.getElementById('mobile-menu-close');
const mobileMenu = document.getElementById('mobile-menu');
const mobileBackdrop = document.getElementById('mobile-menu-backdrop');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

function openMobileMenu() {
    if (!mobileMenu || !mobileBackdrop) return;
    mobileMenu.classList.remove('translate-x-full');
    mobileMenu.classList.add('translate-x-0');
    mobileBackdrop.classList.remove('opacity-0', 'pointer-events-none');
    mobileBackdrop.classList.add('opacity-100', 'pointer-events-auto');
    document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
    if (!mobileMenu || !mobileBackdrop) return;
    mobileMenu.classList.remove('translate-x-0');
    mobileMenu.classList.add('translate-x-full');
    mobileBackdrop.classList.remove('opacity-100', 'pointer-events-auto');
    mobileBackdrop.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = '';
}

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', openMobileMenu);
}

if (mobileMenuClose) {
    mobileMenuClose.addEventListener('click', closeMobileMenu);
}

if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', closeMobileMenu);
}

mobileNavLinks.forEach(link => {
    link.addEventListener('click', closeMobileMenu);
});

sections.forEach(section => observer.observe(section));


