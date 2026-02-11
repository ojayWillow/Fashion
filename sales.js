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

    screen.classList.add('active');
    document.body.style.overflow = 'hidden';

    progressBar.style.width = '0%';
    requestAnimationFrame(() => {
        progressBar.style.transition = 'width 2.2s cubic-bezier(0.4, 0, 0.2, 1)';
        progressBar.style.width = '100%';
    });

    setTimeout(() => {
        window.open(url, '_blank');
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

// ===== CLOUDINARY IMAGE OPTIMIZATION =====
// Serve optimized display versions from Cloudinary (HD master stored, smaller served)
function optimizeCloudinaryUrl(url, width) {
    if (!url || !url.includes('res.cloudinary.com')) return url;
    width = width || 800;
    // If URL already has transforms after /upload/, replace them
    if (/\/upload\/[a-z]/.test(url)) {
        return url.replace(/\/upload\/[^/]+\//, `/upload/w_${width},q_auto:good,f_auto/`);
    }
    // Otherwise insert transforms
    return url.replace('/upload/', `/upload/w_${width},q_auto:good,f_auto/`);
}

// ===== PRICE HELPER =====
function parsePriceValue(priceStr) {
    if (!priceStr) return 0;
    const cleaned = priceStr.replace(/[^0-9.,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

function parseDiscountValue(discountStr) {
    if (!discountStr) return 0;
    const match = discountStr.match(/-?(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

// ===== CURATED PICKS (with filters) =====
let allPicks = [];
let picksFilters = {
    brand: 'all',
    category: 'all',
    subcategory: 'all',
    maxPrice: 600,
    status: 'all',
    sort: 'discount',
};

async function loadPicks() {
    try {
        const res = await fetch('data/picks.json');
        const data = await res.json();
        allPicks = data.picks;
        buildBrandPills();
        setupPicksFilters();
        applyPicksFilters();
    } catch (e) {
        console.error('Error loading picks:', e);
    }
}

// ===== BUILD BRAND PILLS DYNAMICALLY =====
function buildBrandPills() {
    const container = document.getElementById('picksBrandPills');
    if (!container) return;

    // Get unique brands sorted by frequency
    const brandCounts = {};
    allPicks.forEach(p => {
        const b = p.brand || 'Unknown';
        brandCounts[b] = (brandCounts[b] || 0) + 1;
    });

    const sortedBrands = Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([brand]) => brand);

    // Clear existing pills (except "All")
    const allBtn = container.querySelector('[data-brand="all"]');
    container.innerHTML = '';
    container.appendChild(allBtn);

    sortedBrands.forEach(brand => {
        const pill = document.createElement('button');
        pill.className = 'brand-pill';
        pill.dataset.brand = brand;
        pill.textContent = `${brand} (${brandCounts[brand]})`;
        pill.addEventListener('click', () => {
            picksFilters.brand = brand;
            updateBrandPillActive();
            applyPicksFilters();
        });
        addHoverCursor(pill);
        container.appendChild(pill);
    });

    // "All" button handler
    allBtn.addEventListener('click', () => {
        picksFilters.brand = 'all';
        updateBrandPillActive();
        applyPicksFilters();
    });
    addHoverCursor(allBtn);
}

function updateBrandPillActive() {
    document.querySelectorAll('.brand-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.brand === picksFilters.brand);
    });
}

// ===== SETUP FILTER EVENT LISTENERS =====
function setupPicksFilters() {
    // Category dropdown
    const catEl = document.getElementById('picksCategoryFilter');
    if (catEl) catEl.addEventListener('change', (e) => {
        picksFilters.category = e.target.value;
        applyPicksFilters();
    });

    // Subcategory dropdown
    const subEl = document.getElementById('picksSubcategoryFilter');
    if (subEl) subEl.addEventListener('change', (e) => {
        picksFilters.subcategory = e.target.value;
        applyPicksFilters();
    });

    // Price range slider
    const priceEl = document.getElementById('picksPriceRange');
    const priceValEl = document.getElementById('picksPriceValue');
    if (priceEl) priceEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        picksFilters.maxPrice = val;
        if (priceValEl) priceValEl.textContent = val >= 600 ? '€600+' : `€${val}`;
        applyPicksFilters();
    });

    // Status dropdown
    const statusEl = document.getElementById('picksStatusFilter');
    if (statusEl) statusEl.addEventListener('change', (e) => {
        picksFilters.status = e.target.value;
        applyPicksFilters();
    });

    // Sort dropdown
    const sortEl = document.getElementById('picksSort');
    if (sortEl) sortEl.addEventListener('change', (e) => {
        picksFilters.sort = e.target.value;
        applyPicksFilters();
    });

    // Reset button
    const resetEl = document.getElementById('picksFilterReset');
    if (resetEl) {
        resetEl.addEventListener('click', resetPicksFilters);
        addHoverCursor(resetEl);
    }
}

function resetPicksFilters() {
    picksFilters = { brand: 'all', category: 'all', subcategory: 'all', maxPrice: 600, status: 'all', sort: 'discount' };
    updateBrandPillActive();
    const catEl = document.getElementById('picksCategoryFilter');
    const subEl = document.getElementById('picksSubcategoryFilter');
    const priceEl = document.getElementById('picksPriceRange');
    const priceValEl = document.getElementById('picksPriceValue');
    const statusEl = document.getElementById('picksStatusFilter');
    const sortEl = document.getElementById('picksSort');
    if (catEl) catEl.value = 'all';
    if (subEl) subEl.value = 'all';
    if (priceEl) priceEl.value = 600;
    if (priceValEl) priceValEl.textContent = '€600';
    if (statusEl) statusEl.value = 'all';
    if (sortEl) sortEl.value = 'discount';
    applyPicksFilters();
}

// ===== APPLY FILTERS + SORT + RENDER =====
function applyPicksFilters() {
    let filtered = [...allPicks];

    // Brand filter
    if (picksFilters.brand !== 'all') {
        filtered = filtered.filter(p => p.brand === picksFilters.brand);
    }

    // Category filter
    if (picksFilters.category !== 'all') {
        filtered = filtered.filter(p => p.category === picksFilters.category);
    }

    // Subcategory filter
    if (picksFilters.subcategory !== 'all') {
        filtered = filtered.filter(p => p.subcategory === picksFilters.subcategory);
    }

    // Price filter
    if (picksFilters.maxPrice < 600) {
        filtered = filtered.filter(p => parsePriceValue(p.salePrice) <= picksFilters.maxPrice);
    }

    // Status filter
    if (picksFilters.status !== 'all') {
        filtered = filtered.filter(p => p.status === picksFilters.status);
    }

    // Sort
    switch (picksFilters.sort) {
        case 'discount':
            filtered.sort((a, b) => parseDiscountValue(b.discount) - parseDiscountValue(a.discount));
            break;
        case 'price-asc':
            filtered.sort((a, b) => parsePriceValue(a.salePrice) - parsePriceValue(b.salePrice));
            break;
        case 'price-desc':
            filtered.sort((a, b) => parsePriceValue(b.salePrice) - parsePriceValue(a.salePrice));
            break;
        case 'newest':
            filtered.sort((a, b) => (b.id || 0) - (a.id || 0));
            break;
    }

    // Update count
    const countEl = document.getElementById('picksCount');
    if (countEl) {
        countEl.textContent = `${filtered.length} pick${filtered.length !== 1 ? 's' : ''}`;
    }

    renderPicks(filtered);
}

function getPicksByStore(storeName) {
    return allPicks.filter(p => p.store === storeName);
}

// ===== STATUS BADGE BUILDER =====
function buildStatusBadge(pick) {
    if (!pick.status || pick.status === 'active') return '';

    const badges = {
        price_changed: '<span class="pick-status-badge pick-status-price">💰 Price Changed</span>',
        sold_out: '<span class="pick-status-badge pick-status-soldout">🚫 Sold Out</span>',
        ended: '<span class="pick-status-badge pick-status-ended">💀 Ended</span>',
    };
    return badges[pick.status] || '';
}

// ===== PRICE HISTORY INDICATOR =====
function buildPriceHistoryIndicator(pick) {
    if (!pick.priceHistory || pick.priceHistory.length < 2) return '';
    const prev = parsePriceValue(pick.priceHistory[pick.priceHistory.length - 2].salePrice);
    const curr = parsePriceValue(pick.priceHistory[pick.priceHistory.length - 1].salePrice);
    if (curr < prev) return '<span class="pick-price-arrow pick-price-down" title="Price dropped!">↓</span>';
    if (curr > prev) return '<span class="pick-price-arrow pick-price-up" title="Price increased">↑</span>';
    return '';
}

// ===== RENDER PICKS =====
function renderPicks(picks) {
    const grid = document.getElementById('picksGrid');
    if (!grid) return;

    if (!picks.length) {
        grid.innerHTML = `
            <div class="picks-empty">
                <span class="picks-empty-icon">🔍</span>
                <h3>No picks match your filters</h3>
                <p>Try adjusting your filters or <button class="picks-empty-reset" onclick="resetPicksFilters()">reset all</button></p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';
    picks.forEach((pick, i) => {
        const card = document.createElement('div');
        card.className = 'pick-card';
        card.style.animationDelay = `${i * 0.08}s`;

        const statusBadge = buildStatusBadge(pick);
        const priceArrow = buildPriceHistoryIndicator(pick);

        const deadLinkBadge = pick._linkDead
            ? '<span class="pick-card-dead-link" title="This product may no longer be available">⚠ Link Expired</span>'
            : '';

        const sizesHTML = pick.sizes && pick.sizes.length
            ? `<div class="pick-card-sizes-label">Sizes</div>
               <div class="pick-card-sizes">${pick.sizes.map(s => `<span class="pick-size">${s}</span>`).join('')}</div>`
            : '';

        // Category/subcategory tags
        const categoryTag = pick.category ? `<span class="pick-tag pick-tag-category">${pick.category}</span>` : '';
        const subcategoryTag = pick.subcategory ? `<span class="pick-tag pick-tag-subcategory">${pick.subcategory}</span>` : '';

        // Last checked indicator
        const lastChecked = pick.lastChecked
            ? `<span class="pick-card-checked" title="Last checked: ${new Date(pick.lastChecked).toLocaleString()}">✓</span>`
            : '';

        const escapedBrand = (pick.brand || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const escapedStore = (pick.store || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const escapedUrl = (pick.url || '').replace(/'/g, "\\'");

        // Optimized image URL (HD master → optimized display)
        const displayImage = optimizeCloudinaryUrl(pick.image, 800);

        card.innerHTML = `
            <div class="pick-card-image">
                <img src="${displayImage}" alt="${pick.name}" loading="lazy" onerror="handleImageError(this, '${escapedBrand}')">
                <span class="pick-card-discount">${pick.discount}</span>
                <span class="pick-card-store">${pick.storeFlag} ${pick.store}</span>
                ${deadLinkBadge}
                ${statusBadge}
                ${lastChecked}
            </div>
            <div class="pick-card-body">
                <div class="pick-card-brand">${pick.brand}</div>
                <div class="pick-card-name">${pick.name}</div>
                <div class="pick-card-colorway">${pick.colorway}</div>
                <div class="pick-card-pricing">
                    <span class="pick-price-sale">${pick.salePrice}</span>
                    ${priceArrow}
                    <span class="pick-price-retail">${pick.retailPrice}</span>
                </div>
                ${sizesHTML}
                <div class="pick-card-tags">
                    ${categoryTag}${subcategoryTag}
                    ${(pick.tags || []).filter(t => t !== pick.category && t !== pick.subcategory).map(t => `<span class="pick-tag">${t}</span>`).join('')}
                </div>
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

// ===== STORE DETAIL OVERLAY =====
function showStoreDetail(store, picks) {
    document.querySelector('.store-detail-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'store-detail-overlay';

    const escapedStoreName = (store.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    overlay.innerHTML = `
        <div class="store-detail-panel">
            <div class="store-detail-header">
                <div class="store-detail-info">
                    <div class="store-detail-logo">
                        <img src="https://logo.clearbit.com/${store.domain}" alt="${store.name}"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <span class="store-detail-logo-fallback" style="display:none;">${store.flag}</span>
                    </div>
                    <div>
                        <h2 class="store-detail-name">${store.flag} ${store.name}</h2>
                        <p class="store-detail-deal">${store.deal}</p>
                        <p class="store-detail-count">${picks.length} curated pick${picks.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div class="store-detail-actions">
                    <button class="store-detail-visit" onclick="redirectTo('${store.saleUrl}', '${escapedStoreName}')">
                        Visit Store →
                    </button>
                    <button class="store-detail-close" aria-label="Close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="store-detail-grid">
                ${picks.map((pick, i) => {
                    const escapedBrand = (pick.brand || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const escapedUrl = (pick.url || '').replace(/'/g, "\\'");
                    const displayImage = optimizeCloudinaryUrl(pick.image, 800);
                    const sizesHTML = pick.sizes && pick.sizes.length
                        ? `<div class="pick-card-sizes-label">Sizes</div>
                           <div class="pick-card-sizes">${pick.sizes.map(s => `<span class="pick-size">${s}</span>`).join('')}</div>`
                        : '';

                    return `
                        <div class="pick-card" style="animation-delay: ${i * 0.06}s">
                            <div class="pick-card-image">
                                <img src="${displayImage}" alt="${pick.name}" loading="lazy"
                                     onerror="handleImageError(this, '${escapedBrand}')">
                                <span class="pick-card-discount">${pick.discount}</span>
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
                                <div class="pick-card-tags">${(pick.tags || []).map(t => `<span class="pick-tag">${t}</span>`).join('')}</div>
                                <button class="pick-card-cta" onclick="redirectTo('${escapedUrl}', '${escapedStoreName}')">
                                    Shop Now →
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.store-detail-close')) {
            closeStoreDetail(overlay);
        }
    });

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeStoreDetail(overlay);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    overlay.querySelectorAll('.pick-card, .store-detail-visit, .store-detail-close').forEach(addHoverCursor);
}

function closeStoreDetail(overlay) {
    overlay.classList.add('closing');
    document.body.style.overflow = '';
    setTimeout(() => {
        overlay.remove();
    }, 400);
}

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

        const storePicks = getPicksByStore(store.name);
        const picksBadge = storePicks.length > 0
            ? `<span class="store-card-picks-badge">${storePicks.length} pick${storePicks.length !== 1 ? 's' : ''}</span>`
            : '';

        const previewHTML = storePicks.length > 0
            ? `<div class="store-card-preview">
                   <div class="store-preview-images">
                       ${storePicks.slice(0, 3).map(p => `<img src="${optimizeCloudinaryUrl(p.image, 200)}" alt="${p.name}" loading="lazy">`).join('')}
                       ${storePicks.length > 3 ? `<span class="store-preview-more">+${storePicks.length - 3}</span>` : ''}
                   </div>
                   <span class="store-preview-label">View curated picks</span>
               </div>`
            : '';

        card.innerHTML = `
            <div class="store-card-header">
                <div class="store-card-logo">
                    <img src="https://logo.clearbit.com/${store.domain}" alt="${store.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <span class="logo-fallback" style="display:none;">${store.flag}</span>
                </div>
                <div class="store-card-title"><h3>${store.name}</h3><span class="store-location">${store.flag} ${store.country}</span></div>
                <div class="store-card-badges">
                    ${picksBadge}
                    <span class="store-card-category">${store.categoryIcon} ${store.category}</span>
                </div>
            </div>
            <div class="store-card-deal"><div class="deal-label">🔥 Current Deal</div><div class="deal-text">${store.deal}</div></div>
            <p class="store-card-desc">${store.description}</p>
            ${previewHTML}
            <div class="store-card-footer">
                <span class="store-card-cta">${storePicks.length > 0 ? 'View Picks →' : 'Shop Sale →'}</span>
                <span class="store-card-flag">${store.flag}</span>
            </div>
        `;

        card.addEventListener('click', () => {
            if (storePicks.length > 0) {
                showStoreDetail(store, storePicks);
            } else {
                redirectTo(store.saleUrl, store.name);
            }
        });

        addHoverCursor(card); grid.appendChild(card);
    });
}

init();
