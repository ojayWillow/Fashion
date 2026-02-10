/* ===== FASHION. — Interactive Script ===== */

// ===== Custom Following Pointer Cursor =====
const cursorDot = document.getElementById('cursorDot');
const cursorRing = document.getElementById('cursorRing');
let mouseX = 0, mouseY = 0;
let ringX = 0, ringY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursorDot.style.left = mouseX - 4 + 'px';
    cursorDot.style.top = mouseY - 4 + 'px';
});

function animateRing() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    cursorRing.style.left = ringX - 20 + 'px';
    cursorRing.style.top = ringY - 20 + 'px';
    requestAnimationFrame(animateRing);
}
animateRing();

const hoverables = document.querySelectorAll('a, .btn, .ad-banner, .card-3d, .dock-item, .dock-logo, .partner-card');
hoverables.forEach(el => {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
});

// ===== Text Flip Animation =====
const textFlipWrapper = document.getElementById('textFlipWrapper');
const flipWords = textFlipWrapper.querySelectorAll('.text-flip-word');
let currentFlipIndex = 0;

function flipText() {
    flipWords[currentFlipIndex].classList.remove('active');
    currentFlipIndex = (currentFlipIndex + 1) % flipWords.length;
    flipWords[currentFlipIndex].classList.add('active');
    const wordHeight = flipWords[0].offsetHeight;
    textFlipWrapper.style.transform = `translateY(-${currentFlipIndex * wordHeight}px)`;
}
setInterval(flipText, 2500);

// ===== Floating Dock — macOS-style magnification =====
const dockItems = document.querySelectorAll('.dock-item');
dockItems.forEach((item, index) => {
    item.addEventListener('mouseenter', () => {
        if (dockItems[index - 1]) dockItems[index - 1].classList.add('neighbor');
        if (dockItems[index + 1]) dockItems[index + 1].classList.add('neighbor');
    });
    item.addEventListener('mouseleave', () => {
        dockItems.forEach(i => i.classList.remove('neighbor'));
    });
});

// ===== Banner Pointer Trail Effect =====
const banners = document.querySelectorAll('.banner-interactive');
banners.forEach(banner => {
    const trail = banner.querySelector('.banner-pointer-trail');
    banner.addEventListener('mousemove', (e) => {
        const rect = banner.getBoundingClientRect();
        trail.style.left = (e.clientX - rect.left - 100) + 'px';
        trail.style.top = (e.clientY - rect.top - 100) + 'px';
    });
});

// ===== 3D Card Tilt Effect =====
const tiltCards = document.querySelectorAll('.card-3d');
tiltCards.forEach(card => {
    const inner = card.querySelector('.card-3d-inner');
    const shine = card.querySelector('.card-3d-shine');
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        inner.style.transform = `rotateX(${((y - centerY) / centerY) * -12}deg) rotateY(${((x - centerX) / centerX) * 12}deg)`;
        shine.style.setProperty('--shine-x', (x / rect.width) * 100 + '%');
        shine.style.setProperty('--shine-y', (y / rect.height) * 100 + '%');
    });
    card.addEventListener('mouseleave', () => {
        inner.style.transform = 'rotateX(0) rotateY(0)';
    });
});

// ===== Load Partners from JSON and Display =====
let allPartners = [];

async function loadPartners() {
    try {
        const response = await fetch('data/stores.json');
        const data = await response.json();
        
        // Flatten all stores from all categories
        data.categories.forEach(category => {
            category.stores.forEach(store => {
                allPartners.push({
                    name: store.name,
                    country: store.country,
                    flag: store.flag,
                    url: store.url
                });
            });
        });
        
        displayPartners();
    } catch (error) {
        console.error('Error loading partners:', error);
    }
}

function displayPartners() {
    const topRow = document.querySelector('.partners-row-top');
    const bottomRow = document.querySelector('.partners-row-bottom');
    
    if (!topRow || !bottomRow) return;
    
    // Clear existing
    topRow.innerHTML = '';
    bottomRow.innerHTML = '';
    
    // Split partners into two rows
    const half = Math.ceil(allPartners.length / 2);
    
    allPartners.slice(0, half).forEach((partner, index) => {
        topRow.appendChild(createPartnerCard(partner, index));
    });
    
    allPartners.slice(half).forEach((partner, index) => {
        bottomRow.appendChild(createPartnerCard(partner, half + index));
    });
}

function createPartnerCard(partner, index) {
    const card = document.createElement('div');
    card.className = 'partner-card';
    card.dataset.index = index;
    card.innerHTML = `
        <span class="partner-card-emoji">${partner.flag}</span>
        <div class="partner-card-info">
            <strong>${partner.name}</strong>
            <span>${partner.country}</span>
        </div>
        <div class="partner-card-pin"></div>
    `;
    card.addEventListener('click', () => {
        window.open(partner.url, '_blank');
    });
    return card;
}

// Initialize partners on page load
loadPartners();

// ===== Scroll Reveal Animations =====
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('visible'), i * 80);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.ad-banner, .card-3d, .brand-category, .partner-card').forEach(el => observer.observe(el));

// ===== Dock auto-hide on scroll =====
const dock = document.getElementById('floatingDock');
let lastScroll = 0;
window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    if (currentScroll > lastScroll && currentScroll > 200) {
        dock.style.transform = 'translateX(-50%) translateY(-100px)';
        dock.style.opacity = '0';
    } else {
        dock.style.transform = 'translateX(-50%) translateY(0)';
        dock.style.opacity = '1';
    }
    lastScroll = currentScroll;
});