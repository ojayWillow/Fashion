/* ===== FASHION. — Sales Dashboard ===== */
/* Updated for product-centric + per-store folder data model */
/* Refactored: shared code extracted to src/js/shared/ */

import { initCursor } from './shared/cursor.js';
import { initDock } from './shared/dock.js';
import { redirectTo } from './shared/redirect.js';
import { normalizeImage, handleImageError } from './shared/image.js';
import { loadStoreMetadata, formatPrice, storeDisplayName, storeFlag, bestListing, allSizes } from './shared/format.js';
import { extractDomain } from './shared/utils.js';

// ===== Init shared UI =====
const { addHoverCursor } = initCursor();
initDock(addHoverCursor);

// Make redirectTo available to onclick handlers in innerHTML
window.redirectTo = redirectTo;
window.handleImageError = handleImageError;

// ===== CURATED PICKS =====
let allPicks = [];
let allPicksIndex = [];
let activePickFilter = 'all';

async function loadPicks() {
  try {
    const indexResp = await fetch('data/index.json');
    const indexData = await indexResp.json();
    allPicksIndex = indexData.products;

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

    allPicks = products;
    buildPickFilterPills();
    renderPicks(allPicks);
  } catch (e) {
    console.error('Error loading picks:', e);
  }
}

function buildPickFilterPills() {
  const container = document.getElementById('picksFilterPills');
  if (!container || allPicks.length === 0) return;

  const brands = {};
  const categories = { Sneakers: 0, Clothing: 0 };

  allPicks.forEach(p => {
    if (p.brand) brands[p.brand] = (brands[p.brand] || 0) + 1;
    if (p.tags) {
      if (p.tags.includes('Sneakers')) categories.Sneakers++;
      if (p.tags.includes('Clothing')) categories.Clothing++;
    }
  });

  const pills = [{ label: '\u2726 All', value: 'all', count: allPicks.length }];
  if (categories.Sneakers > 0) pills.push({ label: '\u{1F45F} Sneakers', value: 'tag:Sneakers', count: categories.Sneakers });
  if (categories.Clothing > 0) pills.push({ label: '\u{1F9E5} Clothing', value: 'tag:Clothing', count: categories.Clothing });

  Object.entries(brands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([brand, count]) => pills.push({ label: brand, value: `brand:${brand}`, count }));

  container.innerHTML = pills.map(pill => `
    <button class="picks-pill${pill.value === 'all' ? ' active' : ''}" data-filter="${pill.value}">
      ${pill.label} <span class="pill-count">${pill.count}</span>
    </button>
  `).join('');

  container.querySelectorAll('.picks-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activePickFilter = btn.dataset.filter;
      container.querySelectorAll('.picks-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterAndRenderPicks();
    });
    addHoverCursor(btn);
  });
}

function filterAndRenderPicks() {
  if (activePickFilter === 'all') { renderPicks(allPicks); return; }

  let filtered;
  if (activePickFilter.startsWith('tag:')) {
    const tag = activePickFilter.replace('tag:', '');
    filtered = allPicks.filter(p => p.tags && p.tags.includes(tag));
  } else if (activePickFilter.startsWith('brand:')) {
    const brand = activePickFilter.replace('brand:', '');
    filtered = allPicks.filter(p => p.brand === brand);
  } else {
    filtered = allPicks;
  }
  renderPicks(filtered);
}

function getPicksByStore(storeName) {
  return allPicks.filter(p =>
    (p.listings || []).some(l => storeDisplayName(l.store) === storeName)
  );
}

function renderPicks(picks) {
  const grid = document.getElementById('picksGrid');
  if (!grid || !picks.length) {
    if (grid) grid.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:40px 0;">No picks match this filter</p>';
    return;
  }

  grid.innerHTML = '';
  picks.forEach((product, i) => {
    const card = document.createElement('div');
    card.className = 'pick-card';
    card.style.animationDelay = `${i * 0.08}s`;

    const listing = bestListing(product);
    const salePriceStr = listing ? formatPrice(listing.salePrice) : '';
    const retailPriceStr = listing ? formatPrice(listing.retailPrice) : '';
    const discountStr = listing && listing.discount > 0 ? `-${listing.discount}%` : '';
    const storeName = listing ? storeDisplayName(listing.store) : '';
    const flag = listing ? storeFlag(listing.store) : '\u{1F3F7}\u{FE0F}';
    const url = listing ? listing.url : '';

    const sizes = allSizes(product);
    const sizesHTML = sizes.length
      ? `<div class="pick-card-sizes-label">Available Sizes</div>
         <div class="pick-card-sizes">${sizes.map(s => `<span class="pick-size">${s}</span>`).join('')}</div>`
      : '';

    const tagsHTML = (product.tags || []).map(t => `<span class="pick-tag">${t}</span>`).join('');
    const escapedBrand = (product.brand || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const escapedStore = storeName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const escapedUrl = url.replace(/'/g, "\\'");

    const storeCount = (product.listings || []).length;
    const multiStore = storeCount > 1
      ? `<span class="pick-card-multi-store" title="Available at ${storeCount} stores">${storeCount} stores</span>` : '';

    const imgSrc = normalizeImage(product.image);

    card.innerHTML = `
      <div class="pick-card-image">
        ${imgSrc
          ? `<img src="${imgSrc}" alt="${product.name}" loading="lazy" onerror="handleImageError(this, '${escapedBrand}')">`
          : `<div class="pick-img-fallback"><div class="pick-img-fallback-icon">${product.brand ? product.brand.charAt(0).toUpperCase() : '?'}</div><div class="pick-img-fallback-text">No Image</div></div>`
        }
        ${discountStr ? `<span class="pick-card-discount">${discountStr}</span>` : ''}
        <span class="pick-card-store">${flag} ${storeName}</span>
        ${multiStore}
      </div>
      <div class="pick-card-body">
        <div class="pick-card-brand">${product.brand || ''}</div>
        <div class="pick-card-name">${product.name}</div>
        ${product.colorway && product.colorway !== 'TBD' ? `<div class="pick-card-colorway">${product.colorway}</div>` : ''}
        <div class="pick-card-pricing">
          ${salePriceStr ? `<span class="pick-price-sale">${salePriceStr}</span>` : ''}
          ${retailPriceStr && retailPriceStr !== salePriceStr ? `<span class="pick-price-retail">${retailPriceStr}</span>` : ''}
        </div>
        ${sizesHTML}
        ${tagsHTML ? `<div class="pick-card-tags">${tagsHTML}</div>` : ''}
        <button class="pick-card-cta" onclick="redirectTo('${escapedUrl}', '${escapedStore}')">
          View Deal \u2192
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
            Visit Store \u2192
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
        ${picks.map((product, i) => {
          const listing = (product.listings || []).find(l =>
            storeDisplayName(l.store) === store.name
          ) || (product.listings || [])[0];

          const salePriceStr = listing ? formatPrice(listing.salePrice) : '';
          const retailPriceStr = listing ? formatPrice(listing.retailPrice) : '';
          const discountStr = listing && listing.discount > 0 ? `-${listing.discount}%` : '';
          const url = listing ? listing.url : '';
          const escapedBrand = (product.brand || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const escapedUrl = url.replace(/'/g, "\\'");

          const listingSizes = listing ? [...new Set(listing.sizes || [])] : [];
          const sizesHTML = listingSizes.length
            ? `<div class="pick-card-sizes-label">Sizes</div>
               <div class="pick-card-sizes">${listingSizes.map(s => `<span class="pick-size">${s}</span>`).join('')}</div>`
            : '';

          const imgSrc = normalizeImage(product.image);

          return `
            <div class="pick-card" style="animation-delay: ${i * 0.06}s">
              <div class="pick-card-image">
                ${imgSrc
                  ? `<img src="${imgSrc}" alt="${product.name}" loading="lazy" onerror="handleImageError(this, '${escapedBrand}')">`
                  : `<div class="pick-img-fallback"><div class="pick-img-fallback-icon">${product.brand ? product.brand.charAt(0).toUpperCase() : '?'}</div><div class="pick-img-fallback-text">No Image</div></div>`
                }
                ${discountStr ? `<span class="pick-card-discount">${discountStr}</span>` : ''}
              </div>
              <div class="pick-card-body">
                <div class="pick-card-brand">${product.brand || ''}</div>
                <div class="pick-card-name">${product.name}</div>
                ${product.colorway && product.colorway !== 'TBD' ? `<div class="pick-card-colorway">${product.colorway}</div>` : ''}
                <div class="pick-card-pricing">
                  ${salePriceStr ? `<span class="pick-price-sale">${salePriceStr}</span>` : ''}
                  ${retailPriceStr && retailPriceStr !== salePriceStr ? `<span class="pick-price-retail">${retailPriceStr}</span>` : ''}
                </div>
                ${sizesHTML}
                <div class="pick-card-tags">${(product.tags || []).map(t => `<span class="pick-tag">${t}</span>`).join('')}</div>
                <button class="pick-card-cta" onclick="redirectTo('${escapedUrl}', '${escapedStoreName}')">
                  View Deal \u2192
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

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeStoreDetail(overlay);
      document.removeEventListener('keydown', escHandler);
    }
  });

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('active'));
  overlay.querySelectorAll('.pick-card, .store-detail-visit, .store-detail-close').forEach(addHoverCursor);
}

function closeStoreDetail(overlay) {
  overlay.classList.add('closing');
  document.body.style.overflow = '';
  setTimeout(() => overlay.remove(), 400);
}

// ===== SALES DASHBOARD (Store Cards) =====
let allStores = [], storeCategories = [], activeFilter = 'all', searchQuery = '';

async function init() {
  try {
    // Load shared store metadata first (format.js)
    await loadStoreMetadata();

    // Fetch store index
    const indexResp = await fetch('data/store-index.json');
    const indexData = await indexResp.json();

    // Build category list from index
    storeCategories = indexData.categories.map(catName => {
      const storeInCat = indexData.stores.find(s => s.category === catName);
      return { name: catName, icon: storeInCat ? storeInCat.categoryIcon : '\u{1F3F7}\u{FE0F}' };
    });

    // Load full meta.json for each store (parallel fetch)
    const metaPromises = indexData.stores.map(async (entry) => {
      try {
        const resp = await fetch(`data/stores/${entry.slug}/meta.json`);
        const meta = await resp.json();
        return {
          slug: meta.slug,
          name: meta.name,
          country: meta.country,
          flag: meta.flag,
          url: meta.url,
          saleUrl: meta.saleUrl,
          description: meta.description,
          deal: meta.currentDeal,
          category: meta.category,
          categoryIcon: meta.categoryIcon,
          domain: meta.url ? extractDomain(meta.url) : ''
        };
      } catch (e) {
        console.warn(`Could not load meta for ${entry.slug}:`, e);
        // Fallback to index data
        return {
          slug: entry.slug,
          name: entry.name,
          country: entry.country,
          flag: entry.flag,
          url: '', saleUrl: '', description: '', deal: '',
          category: entry.category,
          categoryIcon: entry.categoryIcon,
          domain: ''
        };
      }
    });

    allStores = await Promise.all(metaPromises);

    buildFilterTabs();
    renderStores();
    setupSearch();
  } catch (error) {
    console.error('Error loading stores:', error);
  }
}

function buildFilterTabs() {
  const container = document.getElementById('filterTabs');
  storeCategories.forEach(cat => {
    const tab = document.createElement('button');
    tab.className = 'filter-tab';
    tab.dataset.filter = cat.name;
    tab.textContent = `${cat.icon} ${cat.name}`;
    tab.addEventListener('click', () => { activeFilter = cat.name; updateActiveTab(); renderStores(); });
    addHoverCursor(tab);
    container.appendChild(tab);
  });
  const allTab = container.querySelector('[data-filter="all"]');
  allTab.addEventListener('click', () => { activeFilter = 'all'; updateActiveTab(); renderStores(); });
  addHoverCursor(allTab);
}

function updateActiveTab() {
  document.querySelectorAll('.filter-tab').forEach(tab =>
    tab.classList.toggle('active', tab.dataset.filter === activeFilter)
  );
}

function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderStores();
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
  grid.style.display = 'grid'; noResults.style.display = 'none';

  grid.innerHTML = '';
  filtered.forEach((store, i) => {
    const card = document.createElement('div');
    card.className = 'store-card';
    card.style.animationDelay = `${i * 0.04}s`;

    const storePicks = getPicksByStore(store.name);
    const picksBadge = storePicks.length > 0
      ? `<span class="store-card-picks-badge">${storePicks.length} pick${storePicks.length !== 1 ? 's' : ''}</span>` : '';

    const previewHTML = storePicks.length > 0
      ? `<div class="store-card-preview">
           <div class="store-preview-images">
             ${storePicks.slice(0, 3).map(p => {
               const pImg = normalizeImage(p.image);
               return pImg ? `<img src="${pImg}" alt="${p.name}" loading="lazy">` : '';
             }).join('')}
             ${storePicks.length > 3 ? `<span class="store-preview-more">+${storePicks.length - 3}</span>` : ''}
           </div>
           <span class="store-preview-label">View curated picks</span>
         </div>` : '';

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
      <div class="store-card-deal"><div class="deal-label">\u{1F525} Current Deal</div><div class="deal-text">${store.deal}</div></div>
      <p class="store-card-desc">${store.description}</p>
      ${previewHTML}
      <div class="store-card-footer">
        <span class="store-card-cta">${storePicks.length > 0 ? 'View Picks \u2192' : 'Shop Sale \u2192'}</span>
        <span class="store-card-flag">${store.flag}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      if (storePicks.length > 0) showStoreDetail(store, storePicks);
      else redirectTo(store.saleUrl, store.name);
    });

    addHoverCursor(card);
    grid.appendChild(card);
  });
}

init();
