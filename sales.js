/* ===== FASHION. — Sales Dashboard Script ===== */

// ===== Cursor =====
const cursorDot = document.getElementById('cursorDot');
const cursorRing = document.getElementById('cursorRing');
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    cursorDot.style.left = mouseX - 4 + 'px';
    cursorDot.style.top = mouseY - 4 + 'px';
});
function animateRing() {
    ringX += (mouseX - ringX) * 0.12; ringY += (mouseY - ringY) * 0.12;
    cursorRing.style.left = ringX - 20 + 'px'; cursorRing.style.top = ringY - 20 + 'px';
    requestAnimationFrame(animateRing);
}
animateRing();

function addHoverCursor(el) {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
}
document.querySelectorAll('a, .btn, .dock-item, .dock-logo').forEach(addHoverCursor);

// ===== Dock =====
const dockItems = document.querySelectorAll('.dock-item');
dockItems.forEach((item, index) => {
    item.addEventListener('mouseenter', () => {
        if (dockItems[index - 1]) dockItems[index - 1].classList.add('neighbor');
        if (dockItems[index + 1]) dockItems[index + 1].classList.add('neighbor');
    });
    item.addEventListener('mouseleave', () => dockItems.forEach(i => i.classList.remove('neighbor')));
});
const dock = document.getElementById('floatingDock');
let lastScroll = 0;
window.addEventListener('scroll', () => {
    const s = window.scrollY;
    if (s > lastScroll && s > 200) { dock.style.transform = 'translateX(-50%) translateY(-100px)'; dock.style.opacity = '0'; }
    else { dock.style.transform = 'translateX(-50%) translateY(0)'; dock.style.opacity = '1'; }
    lastScroll = s;
});

// ===== REDIRECT LOADING SCREEN =====
function createRedirectScreen() {
    if (document.getElementById('redirectScreen')) return;

    const screen = document.createElement('div');
    screen.id = 'redirectScreen';
    screen.className = 'redirect-screen';
    screen.innerHTML = `
        <div class="redirect-screen-content">
            <div class="redirect-logo">FASHION.</div>
            <div class="redirect-spinner">
                <div class="redirect-spinner-ring"></div>
            </div>
            <div class="redirect-status">
                <p class="redirect-heading" id="redirectHeading">Redirecting...</p>
                <p class="redirect-store" id="redirectStore"></p>
                <p class="redirect-domain" id="redirectDomain"></p>
            </div>
            <div class="redirect-progress-bar">
                <div class="redirect-progress-fill" id="redirectProgress"></div>
            </div>
            <p class="redirect-notice">You are being redirected to an external website</p>
        </div>
    `;
    document.body.appendChild(screen);
}

function redirectTo(url, storeName) {
    createRedirectScreen();

    let domain;
    try { domain = new URL(url).hostname; } catch { domain = url; }

    document.getElementById('redirectHeading').textContent = 'Redirecting you to';
    document.getElementById('redirectStore').textContent = storeName || domain;
    document.getElementById('redirectDomain').textContent = domain;

    const screen = document.getElementById('redirectScreen');
    const progressBar = document.getElementById('redirectProgress');

    // Show screen
    screen.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Animate progress bar
    progressBar.style.width = '0%';
    requestAnimationFrame(() => {
        progressBar.style.transition = 'width 2.2s cubic-bezier(0.4, 0, 0.2, 1)';
        progressBar.style.width = '100%';
    });

    // Open external site after animation
    setTimeout(() => {
        window.open(url, '_blank');

        // Fade out
        screen.classList.add('fade-out');
        setTimeout(() => {
            screen.classList.remove('active', 'fade-out');
            document.body.style.overflow = '';
            progressBar.style.transition = 'none';
            progressBar.style.width = '0%';
        }, 500);
    }, 2500);
}

// ===== IMAGE FALLBACK HANDLER =====
function handleImageError(imgEl, brandName) {
    const wrapper = imgEl.parentElement;
    imgEl.style.display = 'none';

    if (wrapper.querySelector('.pick-img-fallback')) return;

    const fallback = document.createElement('div');
    fallback.className = 'pick-img-fallback';
    fallback.innerHTML = `
        <div class="pick-img-fallback-icon">${brandName ? brandName.charAt(0).toUpperCase() : '?'}</div>
        <div class="pick-img-fallback-text">Image Unavailable</div>
    `;
    wrapper.appendChild(fallback);
}

// ===== CURATED PICKS =====
async function loadPicks() {
    try {
        const res = await fetch('data/picks.json');
        const data = await res.json();
        renderPicks(data.picks);
    } catch (e) {
        console.error('Error loading picks:', e);
    }
}

function renderPicks(picks) {
    const grid = document.getElementById('picksGrid');
    if (!grid || !picks.length) return;

    grid.innerHTML = '';
    picks.forEach((pick, i) => {
        const card = document.createElement('div');
        card.className = 'pick-card';
        card.style.animationDelay = `${i * 0.08}s`;

        const deadLinkBadge = pick._linkDead
            ? '<span class="pick-card-dead-link" title="This product may no longer be available">⚠ Link Expired</span>'
            : '';

        const sizesHTML = pick.sizes && pick.sizes.length
            ? `<div class="pick-card-sizes-label">EU Sizes</div>
               <div class="pick-card-sizes">${pick.sizes.map(s => `<span class="pick-size">${s}</span>`).join('')}</div>`
            : '';

        const escapedBrand = (pick.brand || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const escapedStore = (pick.store || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const escapedUrl = (pick.url || '').replace(/'/g, "\\'");

        card.innerHTML = `
            <div class="pick-card-image">
                <img src="${pick.image}" alt="${pick.name}" loading="lazy" onerror="handleImageError(this, '${escapedBrand}')">
                <span class="pick-card-discount">${pick.discount}</span>
                <span class="pick-card-store">${pick.storeFlag} ${pick.store}</span>
                ${deadLinkBadge}
            </div>
            <div class="pick-card-body">
                <div class="pick-card-brand">${pick.brand}</div>
                <div class="pick-card-name">${pick.name}</div>
                <div class="pick-card-colorway">${pick.colorway}</div>
                <div class="pick-card-pricing">
                    <span class="pick-price-sale">${pick.salePrice}</span>
                    <span class="pick-price-retail">${pick.retailPrice}</span>
                </div>
                ${sizesHTML}
                <div class="pick-card-tags">${pick.tags.map(t => `<span class="pick-tag">${t}</span>`).join('')}</div>
                <button class="pick-card-cta" ${pick._linkDead ? 'disabled title="Product no longer available"' : `onclick="redirectTo('${escapedUrl}', '${escapedStore}')"`}>
                    ${pick._linkDead ? 'Unavailable' : 'Shop Now →'}
                </button>
            </div>
        `;
        addHoverCursor(card);
        grid.appendChild(card);
    });
}

loadPicks();

// ===== SALES DASHBOARD =====
let allStores = [], categories = [], activeFilter = 'all', searchQuery = '';

async function init() {
    try {
        const response = await fetch('data/stores.json');
        const data = await response.json();
        categories = data.categories.map(c => ({ name: c.name, icon: c.icon }));
        data.categories.forEach(cat => {
            cat.stores.forEach(store => {
                allStores.push({
                    name: store.name, country: store.country, flag: store.flag,
                    url: store.url, saleUrl: store.saleUrl, description: store.description,
                    deal: store.currentDeal, category: cat.name, categoryIcon: cat.icon,
                    domain: extractDomain(store.url)
                });
            });
        });
        buildFilterTabs();
        renderStores();
        setupSearch();
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

function extractDomain(url) { try { return new URL(url).hostname.replace('www.',''); } catch { return ''; } }

function buildFilterTabs() {
    const container = document.getElementById('filterTabs');
    categories.forEach(cat => {
        const tab = document.createElement('button');
        tab.className = 'filter-tab'; tab.dataset.filter = cat.name;
        tab.textContent = `${cat.icon} ${cat.name}`;
        tab.addEventListener('click', () => { activeFilter = cat.name; updateActiveTab(); renderStores(); });
        addHoverCursor(tab); container.appendChild(tab);
    });
    const allTab = container.querySelector('[data-filter="all"]');
    allTab.addEventListener('click', () => { activeFilter = 'all'; updateActiveTab(); renderStores(); });
    addHoverCursor(allTab);
}

function updateActiveTab() {
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filter === activeFilter));
}

function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim(); renderStores();
    });
}

function renderStores() {
    const grid = document.getElementById('salesGrid');
    const noResults = document.getElementById('noResults');
    const countEl = document.getElementById('searchCount');
    let filtered = allStores;
    if (activeFilter !== 'all') filtered = filtered.filter(s => s.category === activeFilter);
    if (searchQuery) filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(searchQuery) || s.country.toLowerCase().includes(searchQuery) ||
        s.deal.toLowerCase().includes(searchQuery) || s.description.toLowerCase().includes(searchQuery) ||
        s.category.toLowerCase().includes(searchQuery)
    );
    countEl.textContent = `${filtered.length} store${filtered.length !== 1 ? 's' : ''}`;
    if (filtered.length === 0) { grid.style.display = 'none'; noResults.style.display = 'block'; return; }
    else { grid.style.display = 'grid'; noResults.style.display = 'none'; }
    grid.innerHTML = '';
    filtered.forEach((store, i) => {
        const card = document.createElement('div');
        card.className = 'store-card'; card.style.animationDelay = `${i * 0.04}s`;
        card.innerHTML = `
            <div class="store-card-header">
                <div class="store-card-logo">
                    <img src="https://logo.clearbit.com/${store.domain}" alt="${store.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <span class="logo-fallback" style="display:none;">${store.flag}</span>
                </div>
                <div class="store-card-title"><h3>${store.name}</h3><span class="store-location">${store.flag} ${store.country}</span></div>
                <span class="store-card-category">${store.categoryIcon} ${store.category}</span>
            </div>
            <div class="store-card-deal"><div class="deal-label">🔥 Current Deal</div><div class="deal-text">${store.deal}</div></div>
            <p class="store-card-desc">${store.description}</p>
            <div class="store-card-footer"><span class="store-card-cta">Shop Sale →</span><span class="store-card-flag">${store.flag}</span></div>
        `;
        card.addEventListener('click', () => redirectTo(store.saleUrl, store.name));
        addHoverCursor(card); grid.appendChild(card);
    });
}

init();
