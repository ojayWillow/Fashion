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

const hoverables = document.querySelectorAll('a, .btn, .ad-banner, .card-3d, .dock-item, .dock-logo');
hoverables.forEach(el => {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
});

function addHoverCursor(el) {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
}

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
function initTiltCards() {
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
        addHoverCursor(card);
    });
}
initTiltCards();

// ===== LATEST DROPS (from picks.json) =====
async function loadDrops() {
    const grid = document.getElementById('dropsGrid');
    if (!grid) return;

    try {
        const res = await fetch('data/picks.json');
        const data = await res.json();

        // Latest 6 picks (highest ID = newest)
        const latest = [...data.picks]
            .filter(p => !p._linkDead)
            .sort((a, b) => b.id - a.id)
            .slice(0, 6);

        if (latest.length === 0) return;

        grid.innerHTML = latest.map((pick, i) => {
            const escapedUrl = (pick.url || '').replace(/'/g, "\\'");
            return `
                <div class="card-3d" data-tilt>
                    <div class="card-3d-inner">
                        <div class="card-3d-shine"></div>
                        <div class="drop-badge">${pick.discount || 'Sale'}</div>
                        <div class="drop-product-img">
                            <img src="${pick.image}" alt="${pick.name}" loading="lazy"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="drop-img-fallback" style="display:none;">${pick.brand ? pick.brand.charAt(0) : '?'}</div>
                        </div>
                        <div class="drop-card-brand">${pick.brand || ''}</div>
                        <h3>${pick.name}</h3>
                        <p class="drop-region">${pick.storeFlag || '\ud83c\udff7\ufe0f'} ${pick.store}</p>
                        <div class="drop-card-pricing">
                            <span class="drop-price-sale">${pick.salePrice || ''}</span>
                            <span class="drop-price-retail">${pick.retailPrice || ''}</span>
                        </div>
                        <a href="${pick.url}" target="_blank" rel="noopener" class="btn btn-outline card-3d-float">Shop →</a>
                    </div>
                </div>
            `;
        }).join('');

        // Re-init tilt on new cards
        initTiltCards();

    } catch (e) {
        console.error('Error loading drops:', e);
    }
}

loadDrops();

// ===== PARTNERS — Floating Marquee =====
async function loadPartners() {
    try {
        const response = await fetch('data/stores.json');
        const data = await response.json();

        const allStores = [];
        data.categories.forEach(cat => {
            cat.stores.forEach(store => {
                allStores.push({
                    name: store.name,
                    country: store.country,
                    flag: store.flag,
                    url: store.url,
                    deal: store.currentDeal
                });
            });
        });

        buildMarquee(allStores);
    } catch (error) {
        console.error('Error loading partners:', error);
    }
}

function buildMarquee(stores) {
    const area = document.getElementById('marqueeArea');
    if (!area) return;

    // Shuffle stores for variety
    const shuffled = [...stores].sort(() => Math.random() - 0.5);

    // Split into rows (roughly equal)
    const rowCount = 4;
    const rows = Array.from({ length: rowCount }, () => []);
    shuffled.forEach((store, i) => {
        rows[i % rowCount].push(store);
    });

    rows.forEach((rowStores, rowIndex) => {
        const row = document.createElement('div');
        row.className = `marquee-row ${rowIndex % 2 === 0 ? 'scroll-left' : 'scroll-right'}`;

        // Speed variation per row
        const duration = 50 + rowIndex * 12;
        row.style.setProperty('--duration', `${duration}s`);

        // Duplicate for seamless loop
        const allItems = [...rowStores, ...rowStores];

        allItems.forEach(store => {
            const pill = document.createElement('div');
            pill.className = 'partner-pill';
            pill.innerHTML = `
                <span class="partner-pill-flag">${store.flag}</span>
                <span class="partner-pill-name">${store.name}</span>
                <span class="partner-pill-country">${store.country}</span>
                <span class="partner-pill-deal">${store.deal}</span>
            `;
            pill.addEventListener('click', () => {
                window.open(store.url, '_blank');
            });
            addHoverCursor(pill);
            row.appendChild(pill);
        });

        area.appendChild(row);
    });
}

loadPartners();

// ===== Scroll Reveal Animations =====
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('visible'), i * 80);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.ad-banner, .card-3d, .brand-category').forEach(el => observer.observe(el));

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
