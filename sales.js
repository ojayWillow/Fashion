/* ===== FASHION. — Sales Dashboard Script ===== */

// ===== Cursor =====
const cursorDot = document.getElementById('cursorDot');
const cursorRing = document.getElementById('cursorRing');
let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

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

function addHoverCursor(el) {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
}

document.querySelectorAll('a, .btn, .dock-item, .dock-logo').forEach(addHoverCursor);

// ===== Dock magnification =====
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

// ===== Dock auto-hide =====
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

// ===== Sales Dashboard =====
let allStores = [];
let categories = [];
let activeFilter = 'all';
let searchQuery = '';

async function init() {
    try {
        const response = await fetch('data/stores.json');
        const data = await response.json();

        categories = data.categories.map(c => ({ name: c.name, icon: c.icon }));

        data.categories.forEach(cat => {
            cat.stores.forEach(store => {
                allStores.push({
                    name: store.name,
                    country: store.country,
                    flag: store.flag,
                    url: store.url,
                    saleUrl: store.saleUrl,
                    description: store.description,
                    deal: store.currentDeal,
                    category: cat.name,
                    categoryIcon: cat.icon,
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

function extractDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch {
        return '';
    }
}

// ===== Filter Tabs =====
function buildFilterTabs() {
    const container = document.getElementById('filterTabs');

    categories.forEach(cat => {
        const tab = document.createElement('button');
        tab.className = 'filter-tab';
        tab.dataset.filter = cat.name;
        tab.textContent = `${cat.icon} ${cat.name}`;
        tab.addEventListener('click', () => {
            activeFilter = cat.name;
            updateActiveTab();
            renderStores();
        });
        addHoverCursor(tab);
        container.appendChild(tab);
    });

    // "All" tab click handler
    container.querySelector('[data-filter="all"]').addEventListener('click', () => {
        activeFilter = 'all';
        updateActiveTab();
        renderStores();
    });
    addHoverCursor(container.querySelector('[data-filter="all"]'));
}

function updateActiveTab() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === activeFilter);
    });
}

// ===== Search =====
function setupSearch() {
    const input = document.getElementById('searchInput');
    input.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderStores();
    });
}

// ===== Render Store Cards =====
function renderStores() {
    const grid = document.getElementById('salesGrid');
    const noResults = document.getElementById('noResults');
    const countEl = document.getElementById('searchCount');

    let filtered = allStores;

    // Category filter
    if (activeFilter !== 'all') {
        filtered = filtered.filter(s => s.category === activeFilter);
    }

    // Search filter
    if (searchQuery) {
        filtered = filtered.filter(s =>
            s.name.toLowerCase().includes(searchQuery) ||
            s.country.toLowerCase().includes(searchQuery) ||
            s.deal.toLowerCase().includes(searchQuery) ||
            s.description.toLowerCase().includes(searchQuery) ||
            s.category.toLowerCase().includes(searchQuery)
        );
    }

    // Update count
    countEl.textContent = `${filtered.length} store${filtered.length !== 1 ? 's' : ''}`;

    // Show/hide no results
    if (filtered.length === 0) {
        grid.style.display = 'none';
        noResults.style.display = 'block';
        return;
    } else {
        grid.style.display = 'grid';
        noResults.style.display = 'none';
    }

    // Build cards
    grid.innerHTML = '';

    filtered.forEach((store, i) => {
        const card = document.createElement('div');
        card.className = 'store-card';
        card.style.animationDelay = `${i * 0.04}s`;

        card.innerHTML = `
            <div class="store-card-header">
                <div class="store-card-logo">
                    <img src="https://logo.clearbit.com/${store.domain}" 
                         alt="${store.name}" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                    >
                    <span class="logo-fallback" style="display:none;">${store.flag}</span>
                </div>
                <div class="store-card-title">
                    <h3>${store.name}</h3>
                    <span class="store-location">${store.flag} ${store.country}</span>
                </div>
                <span class="store-card-category">${store.categoryIcon} ${store.category}</span>
            </div>
            <div class="store-card-deal">
                <div class="deal-label">🔥 Current Deal</div>
                <div class="deal-text">${store.deal}</div>
            </div>
            <p class="store-card-desc">${store.description}</p>
            <div class="store-card-footer">
                <span class="store-card-cta">Shop Sale →</span>
                <span class="store-card-flag">${store.flag}</span>
            </div>
        `;

        card.addEventListener('click', () => {
            window.open(store.saleUrl, '_blank');
        });

        addHoverCursor(card);
        grid.appendChild(card);
    });
}

// ===== Init =====
init();
