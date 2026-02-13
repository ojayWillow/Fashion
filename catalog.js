/**
 * FASHION. — Catalog Page
 * ========================
 * Loads product data from the new product-centric data model
 * (data/index.json + data/products/*.json) and renders the
 * product grid with filters.
 *
 * Part of #5 — Data Architecture migration (Step 5)
 */

(function () {
  'use strict';

  // ===== STATE =====
  let allProducts = [];
  let filtered = [];
  let storeMetadata = {}; // slug -> { name, flag, ... }
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

  // ===== CLOUDINARY IMAGE NORMALIZER =====
  function normalizeImage(url) {
    if (!url || url === '/favicon.png') return '';
    // Trim whitespace/borders, then pad uniformly with #F5F5F7 to match card bg
    return url.replace(
      'f_auto,q_auto,w_800,h_800,c_pad,b_white',
      'f_auto,q_auto/e_trim/w_800,h_800,c_pad,b_rgb:F5F5F7'
    );
  }

  // ===== HELPERS =====
  function formatPrice(priceObj) {
    if (!priceObj || !priceObj.amount) return '';
    const symbols = { EUR: '€', GBP: '£', USD: '$' };
    const sym = symbols[priceObj.currency] || priceObj.currency + ' ';
    return `${sym}${priceObj.amount}`;
  }

  function bestListing(product) {
    if (!product.listings || product.listings.length === 0) return null;
    const available = product.listings.filter(l => l.available);
    const pool = available.length > 0 ? available : product.listings;
    return pool.reduce((best, l) =>
      (l.salePrice && l.salePrice.amount > 0 && (!best.salePrice || l.salePrice.amount < best.salePrice.amount)) ? l : best
    );
  }

  function allSizes(product) {
    if (!product.listings) return [];
    const s = new Set();
    product.listings.forEach(l => (l.sizes || []).forEach(sz => s.add(sz)));
    return [...s];
  }

  function allStoreNames(product) {
    if (!product.listings) return [];
    return product.listings.map(l => storeDisplayName(l.store));
  }

  function storeDisplayName(slug) {
    if (storeMetadata[slug]) return storeMetadata[slug].name;
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function storeFlag(slug) {
    if (storeMetadata[slug]) return storeMetadata[slug].flag || '🏷️';
    return '🏷️';
  }

  // ===== LOAD DATA =====
  async function loadData() {
    try {
      // Load store metadata for display names / flags
      try {
        const storesResp = await fetch('data/stores.json');
        const storesData = await storesResp.json();
        if (storesData.categories) {
          for (const cat of storesData.categories) {
            for (const s of cat.stores) {
              const domain = s.url ? new URL(s.url).hostname.replace('www.', '') : '';
              const slug = s.name.toLowerCase()
                .replace(/[^\w\s-]/g, '').replace(/[\s]+/g, '-').replace(/\.$/,'');
              const knownSlugs = {
                'END. Clothing': 'end-clothing',
                'Foot Locker': 'foot-locker',
                'SNS (Sneakersnstuff)': 'sns',
                'MR PORTER': 'mr-porter'
              };
              const key = knownSlugs[s.name] || slug;
              storeMetadata[key] = { name: s.name, flag: s.flag, domain };
            }
          }
        }
      } catch (e) {
        console.warn('Could not load stores.json:', e);
      }

      // Load product index
      const indexResp = await fetch('data/index.json');
      const indexData = await indexResp.json();

      const products = [];
      for (const entry of indexData.products) {
        try {
          const resp = await fetch(`data/products/${entry.productId}.json`);
          const product = await resp.json();
          products.push(product);
        } catch (e) {
          console.warn(`Could not load product ${entry.productId}:`, e);
        }
      }

      allProducts = products;

      const storeSet = new Set();
      allProducts.forEach(p => (p.listings || []).forEach(l => storeSet.add(l.store)));

      heroBadge.textContent = `🛍️ ${allProducts.length} PRODUCTS — ${storeSet.size} STORES`;

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
      const cat = (p.category || 'Other').toLowerCase();
      categories[cat] = (categories[cat] || 0) + 1;

      if (p.brand) {
        brands[p.brand] = (brands[p.brand] || 0) + 1;
      }

      for (const l of (p.listings || [])) {
        const name = storeDisplayName(l.store);
        stores[name] = (stores[name] || 0) + 1;
      }

      allSizes(p).forEach(s => sizes.add(s));
    }

    renderCheckboxFilter('filterCategory', categories, 'category');
    renderCheckboxFilter('filterBrand', sortObj(brands), 'brand');
    renderCheckboxFilter('filterStore', stores, 'store');
    renderSizeFilter('filterSize', sizes);

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

    const sorted = [...sizesSet].sort((a, b) => {
      const na = parseFloat(a.replace(/[^\d.]/g, '')), nb = parseFloat(b.replace(/[^\d.]/g, ''));
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
      if (q) {
        const haystack = `${p.name} ${p.brand} ${p.colorway} ${(p.tags || []).join(' ')} ${allStoreNames(p).join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (filters.category.length > 0) {
        if (!filters.category.includes((p.category || 'Other').toLowerCase())) return false;
      }

      if (filters.brand.length > 0) {
        if (!filters.brand.includes(p.brand)) return false;
      }

      if (filters.store.length > 0) {
        const productStores = allStoreNames(p);
        if (!filters.store.some(s => productStores.includes(s))) return false;
      }

      if (filters.size.length > 0) {
        const productSizes = allSizes(p);
        if (!filters.size.some(s => productSizes.includes(s))) return false;
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
          return (b.productId || '').localeCompare(a.productId || '');
        case 'price-asc': {
          const pa = bestListing(a), pb = bestListing(b);
          return ((pa && pa.salePrice) ? pa.salePrice.amount : 99999) - ((pb && pb.salePrice) ? pb.salePrice.amount : 99999);
        }
        case 'price-desc': {
          const pa = bestListing(a), pb = bestListing(b);
          return ((pb && pb.salePrice) ? pb.salePrice.amount : 0) - ((pa && pa.salePrice) ? pa.salePrice.amount : 0);
        }
        case 'discount': {
          const da = Math.max(...(a.listings || []).map(l => l.discount || 0));
          const db = Math.max(...(b.listings || []).map(l => l.discount || 0));
          return db - da;
        }
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
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
    const listing = bestListing(p);
    const sizes = allSizes(p);
    const storeName = listing ? storeDisplayName(listing.store) : '';
    const flag = listing ? storeFlag(listing.store) : '🏷️';
    const url = listing ? listing.url : '';

    const salePriceStr = listing ? formatPrice(listing.salePrice) : '';
    const retailPriceStr = listing ? formatPrice(listing.retailPrice) : '';
    const discountStr = listing && listing.discount > 0 ? `-${listing.discount}%` : '';

    const storeCount = (p.listings || []).length;
    const multiStoreBadge = storeCount > 1
      ? `<div class="pick-card-multi-store">${storeCount} stores</div>` : '';

    const sizesHtml = sizes.slice(0, 8).map(s =>
      `<span class="pick-size">${s}</span>`
    ).join('');

    const moreSizes = sizes.length > 8
      ? `<span class="pick-size">+${sizes.length - 8}</span>` : '';

    const tagsHtml = (p.tags || []).map(t =>
      `<span class="pick-tag">${t}</span>`
    ).join('');

    const imgUrl = normalizeImage(p.image);
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=pick-img-fallback><div class=pick-img-fallback-icon>${esc(p.brand ? p.brand[0] : '?')}</div><div class=pick-img-fallback-text>Image unavailable</div></div>'">`
      : `<div class="pick-img-fallback"><div class="pick-img-fallback-icon">${esc(p.brand ? p.brand[0] : '?')}</div><div class="pick-img-fallback-text">No image</div></div>`;

    return `
      <div class="pick-card" data-url="${esc(url)}" data-store="${esc(storeName)}" data-product-id="${esc(p.productId)}" style="animation-delay:${delay}s">
        <div class="pick-card-image">
          ${discountStr ? `<div class="pick-card-discount">${esc(discountStr)}</div>` : ''}
          <div class="pick-card-store">${esc(flag)} ${esc(storeName)}</div>
          ${multiStoreBadge}
          ${imgHtml}
        </div>
        <div class="pick-card-body">
          ${p.brand ? `<div class="pick-card-brand">${esc(p.brand)}</div>` : ''}
          <div class="pick-card-name">${esc(p.name)}</div>
          ${p.colorway && p.colorway !== 'TBD' ? `<div class="pick-card-colorway">${esc(p.colorway)}</div>` : ''}
          <div class="pick-card-pricing">
            ${salePriceStr ? `<span class="pick-price-sale">${esc(salePriceStr)}</span>` : ''}
            ${retailPriceStr && retailPriceStr !== salePriceStr ? `<span class="pick-price-retail">${esc(retailPriceStr)}</span>` : ''}
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
