/**
 * FASHION. — Catalog Page
 * ========================
 * Loads inventory data, renders product grid with filters.
 * Reuses pick-card markup from sales page for consistency.
 */

(function () {
  'use strict';

  // ===== STATE =====
  let allProducts = [];
  let filtered = [];
  const filters = { category: [], brand: [], store: [], size: [], search: '' };
  let sortMode = 'newest';

  // ===== DOM =====
  const grid = document.getElementById('catalogGrid');
  const noResults = document.getElementById('noResults');
  const searchInput = document.getElementById('catalogSearch');
  const resultCount = document.getElementById('resultCount');
  const heroBadge = document.getElementById('heroBadge');
  const sortSelect = document.getElementById('catalogSort');
  const filterToggle = document.getElementById('filterToggle');
  const sidebar = document.getElementById('catalogSidebar');
  const sidebarClose = document.getElementById('sidebarClose');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const activeChips = document.getElementById('activeChips');
  const clearAllBtn = document.getElementById('clearAll');

  // ===== LOAD DATA =====
  async function loadData() {
    try {
      const indexResp = await fetch('data/catalog-index.json');
      const index = await indexResp.json();

      const products = [];
      for (const store of index.stores) {
        try {
          const resp = await fetch(`data/inventory/${store.file}`);
          const data = await resp.json();
          if (data.products) {
            for (const p of data.products) {
              p._store = data.store;
              p._storeFlag = data.storeFlag;
              products.push(p);
            }
          }
        } catch (e) {
          console.warn(`Could not load ${store.file}:`, e);
        }
      }

      allProducts = products;
      heroBadge.textContent = `🛍️ ${allProducts.length} PRODUCTS — ${index.stores.length} STORES`;

      buildFilters();
      applyFilters();
    } catch (e) {
      console.error('Failed to load catalog data:', e);
      heroBadge.textContent = '⚠️ COULD NOT LOAD CATALOG';
    }
  }

  // ===== BUILD SIDEBAR FILTERS =====
  function buildFilters() {
    const categories = {};
    const brands = {};
    const stores = {};
    const sizes = new Set();

    for (const p of allProducts) {
      // Category
      const cat = p.category || 'other';
      categories[cat] = (categories[cat] || 0) + 1;

      // Brand
      if (p.brand) {
        brands[p.brand] = (brands[p.brand] || 0) + 1;
      }

      // Store
      const store = p._store || 'Unknown';
      stores[store] = (stores[store] || 0) + 1;

      // Sizes
      if (p.sizes) {
        for (const s of p.sizes) sizes.add(s);
      }
    }

    renderCheckboxFilter('filterCategory', categories, 'category');
    renderCheckboxFilter('filterBrand', sortObj(brands), 'brand');
    renderCheckboxFilter('filterStore', stores, 'store');
    renderSizeFilter('filterSize', sizes);

    // Collapsible toggles
    document.querySelectorAll('.filter-group-title').forEach(title => {
      title.addEventListener('click', () => {
        title.classList.toggle('collapsed');
        const body = title.nextElementSibling;
        if (body) body.classList.toggle('collapsed');
      });
    });
  }

  function sortObj(obj) {
    return Object.fromEntries(
      Object.entries(obj).sort((a, b) => b[1] - a[1])
    );
  }

  function renderCheckboxFilter(containerId, data, filterKey) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    for (const [value, count] of Object.entries(data)) {
      const div = document.createElement('div');
      div.className = 'filter-option';
      div.dataset.value = value;
      div.dataset.filterKey = filterKey;
      div.innerHTML = `
        <span class="filter-checkbox">✓</span>
        <span class="filter-label">${capitalize(value)}</span>
        <span class="filter-count">${count}</span>
      `;
      div.addEventListener('click', () => toggleFilter(filterKey, value, div));
      container.appendChild(div);
    }
  }

  function renderSizeFilter(containerId, sizesSet) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // Sort sizes: numeric first (ascending), then alpha
    const sorted = [...sizesSet].sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });

    for (const size of sorted) {
      const btn = document.createElement('button');
      btn.className = 'size-btn';
      btn.textContent = size;
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        toggleFilter('size', size);
      });
      container.appendChild(btn);
    }
  }

  // ===== FILTER LOGIC =====
  function toggleFilter(key, value, el) {
    const arr = filters[key];
    const idx = arr.indexOf(value);
    if (idx > -1) {
      arr.splice(idx, 1);
      if (el) el.classList.remove('active');
    } else {
      arr.push(value);
      if (el) el.classList.add('active');
    }
    applyFilters();
  }

  function applyFilters() {
    const q = filters.search.toLowerCase();

    filtered = allProducts.filter(p => {
      // Text search
      if (q) {
        const haystack = `${p.name} ${p.brand} ${p.colorway} ${p._store} ${(p.tags || []).join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Category
      if (filters.category.length > 0) {
        if (!filters.category.includes(p.category || 'other')) return false;
      }

      // Brand
      if (filters.brand.length > 0) {
        if (!filters.brand.includes(p.brand)) return false;
      }

      // Store
      if (filters.store.length > 0) {
        if (!filters.store.includes(p._store)) return false;
      }

      // Size
      if (filters.size.length > 0) {
        if (!p.sizes || !filters.size.some(s => p.sizes.includes(s))) return false;
      }

      return true;
    });

    sortProducts();
    renderGrid();
    updateChips();
    updateCounts();
  }

  function sortProducts() {
    filtered.sort((a, b) => {
      switch (sortMode) {
        case 'newest':
          return (b.addedDate || '').localeCompare(a.addedDate || '');
        case 'price-asc':
          return priceNum(a.salePrice) - priceNum(b.salePrice);
        case 'price-desc':
          return priceNum(b.salePrice) - priceNum(a.salePrice);
        case 'discount':
          return discountNum(b.discount) - discountNum(a.discount);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }

  function priceNum(str) {
    if (!str) return 99999;
    return parseFloat(str.replace(/[^\d.]/g, '')) || 99999;
  }

  function discountNum(str) {
    if (!str) return 0;
    return parseInt(str.replace(/[^\d]/g, '')) || 0;
  }

  // ===== RENDER =====
  function renderGrid() {
    if (filtered.length === 0) {
      grid.innerHTML = '';
      noResults.style.display = 'block';
      return;
    }
    noResults.style.display = 'none';

    grid.innerHTML = filtered.map((p, i) => {
      const delay = Math.min(i * 0.04, 1);
      return buildCard(p, delay);
    }).join('');

    // Card click handlers
    grid.querySelectorAll('.pick-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.pick-size')) return;
        const url = card.dataset.url;
        const store = card.dataset.store;
        if (url) handleRedirect(url, store);
      });
    });
  }

  function buildCard(p, delay) {
    const sizesHtml = (p.sizes || []).slice(0, 8).map(s =>
      `<span class="pick-size">${s}</span>`
    ).join('');

    const moreSizes = (p.sizes || []).length > 8
      ? `<span class="pick-size">+${p.sizes.length - 8}</span>` : '';

    const tagsHtml = (p.tags || []).map(t =>
      `<span class="pick-tag">${t}</span>`
    ).join('');

    const imgHtml = p.image
      ? `<img src="${p.image}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=pick-img-fallback><div class=pick-img-fallback-icon>${esc(p.brand ? p.brand[0] : '?')}</div><div class=pick-img-fallback-text>Image unavailable</div></div>'">`
      : `<div class="pick-img-fallback"><div class="pick-img-fallback-icon">${esc(p.brand ? p.brand[0] : '?')}</div><div class="pick-img-fallback-text">No image</div></div>`;

    return `
      <div class="pick-card" data-url="${esc(p.url)}" data-store="${esc(p._store || '')}" style="animation-delay:${delay}s">
        <div class="pick-card-image">
          ${p.discount && p.discount !== '0%' ? `<div class="pick-card-discount">${esc(p.discount)}</div>` : ''}
          <div class="pick-card-store">${esc(p._storeFlag || '🏷️')} ${esc(p._store || 'Store')}</div>
          ${imgHtml}
        </div>
        <div class="pick-card-body">
          ${p.brand ? `<div class="pick-card-brand">${esc(p.brand)}</div>` : ''}
          <div class="pick-card-name">${esc(p.name)}</div>
          ${p.colorway ? `<div class="pick-card-colorway">${esc(p.colorway)}</div>` : ''}
          <div class="pick-card-pricing">
            ${p.salePrice ? `<span class="pick-price-sale">${esc(p.salePrice)}</span>` : ''}
            ${p.retailPrice && p.retailPrice !== p.salePrice ? `<span class="pick-price-retail">${esc(p.retailPrice)}</span>` : ''}
          </div>
          ${sizesHtml ? `
            <div class="pick-card-sizes-label">Available sizes</div>
            <div class="pick-card-sizes">${sizesHtml}${moreSizes}</div>
          ` : ''}
          ${tagsHtml ? `<div class="pick-card-tags">${tagsHtml}</div>` : ''}
          <button class="pick-card-cta">View Deal →</button>
        </div>
      </div>
    `;
  }

  // ===== CHIPS & COUNTS =====
  function updateChips() {
    const chips = [];
    for (const key of ['category', 'brand', 'store', 'size']) {
      for (const val of filters[key]) {
        chips.push({ key, val });
      }
    }

    activeChips.innerHTML = chips.map(c =>
      `<span class="filter-chip" data-key="${c.key}" data-val="${esc(c.val)}">${capitalize(c.val)} <span class="chip-x">✕</span></span>`
    ).join('');

    activeChips.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        removeFilter(chip.dataset.key, chip.dataset.val);
      });
    });

    clearAllBtn.style.display = chips.length > 0 ? 'inline-block' : 'none';
    filterToggle.classList.toggle('has-filters', chips.length > 0);
  }

  function removeFilter(key, val) {
    const arr = filters[key];
    const idx = arr.indexOf(val);
    if (idx > -1) arr.splice(idx, 1);

    // Update sidebar UI
    if (key === 'size') {
      document.querySelectorAll('#filterSize .size-btn').forEach(btn => {
        if (btn.textContent === val) btn.classList.remove('active');
      });
    } else {
      const containerId = 'filter' + capitalize(key);
      document.querySelectorAll(`#${containerId} .filter-option`).forEach(opt => {
        if (opt.dataset.value === val) opt.classList.remove('active');
      });
    }

    applyFilters();
  }

  function updateCounts() {
    resultCount.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;
  }

  // ===== REDIRECT =====
  function handleRedirect(url, storeName) {
    const screen = document.getElementById('redirectScreen');
    const storeEl = document.getElementById('redirectStore');
    const domainEl = document.getElementById('redirectDomain');
    const progress = document.getElementById('redirectProgress');

    try {
      const u = new URL(url);
      storeEl.textContent = storeName || u.hostname;
      domainEl.textContent = u.hostname;
    } catch {
      storeEl.textContent = storeName || 'Store';
      domainEl.textContent = url;
    }

    screen.classList.add('active');
    progress.style.width = '0%';
    progress.style.transition = 'none';

    requestAnimationFrame(() => {
      progress.style.transition = 'width 1.2s ease';
      progress.style.width = '100%';
    });

    setTimeout(() => {
      window.open(url, '_blank');
      screen.classList.add('fade-out');
      setTimeout(() => {
        screen.classList.remove('active', 'fade-out');
      }, 500);
    }, 1400);
  }

  // ===== SIDEBAR TOGGLE (mobile) =====
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  filterToggle.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarBackdrop.addEventListener('click', closeSidebar);

  // ===== CLEAR ALL =====
  clearAllBtn.addEventListener('click', () => {
    filters.category = [];
    filters.brand = [];
    filters.store = [];
    filters.size = [];

    document.querySelectorAll('.filter-option.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.size-btn.active').forEach(el => el.classList.remove('active'));

    applyFilters();
  });

  // ===== SEARCH =====
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filters.search = searchInput.value.trim();
      applyFilters();
    }, 250);
  });

  // ===== SORT =====
  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value;
    applyFilters();
  });

  // ===== HELPERS =====
  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ===== CURSOR (from main site) =====
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if (dot && ring && window.matchMedia('(pointer: fine)').matches) {
    let mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
    (function moveCursor() {
      rx += (mx - rx) * 0.15; ry += (my - ry) * 0.15;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(moveCursor);
    })();
    document.querySelectorAll('a, button, .pick-card, .filter-option, .size-btn, .filter-toggle').forEach(el => {
      el.addEventListener('mouseenter', () => ring.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => ring.classList.remove('cursor-hover'));
    });
  }

  // ===== INIT =====
  loadData();

})();
