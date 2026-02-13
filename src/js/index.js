/* ===== FASHION. — Homepage Script ===== */
/* Refactored: shared code extracted to src/js/shared/ */

import { initCursor } from './shared/cursor.js';
import { initDock } from './shared/dock.js';

// ===== Init shared UI =====
const { addHoverCursor } = initCursor();
initDock(addHoverCursor);

// ===== Text Flip Animation =====
const textFlipWrapper = document.getElementById('textFlipWrapper');
if (textFlipWrapper) {
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
}

// ===== Banner Pointer Trail Effect =====
document.querySelectorAll('.banner-interactive').forEach(banner => {
  const trail = banner.querySelector('.banner-pointer-trail');
  if (!trail) return;
  banner.addEventListener('mousemove', (e) => {
    const rect = banner.getBoundingClientRect();
    trail.style.left = (e.clientX - rect.left - 100) + 'px';
    trail.style.top = (e.clientY - rect.top - 100) + 'px';
  });
});

// ===== 3D Card Tilt Effect =====
function initTiltCards() {
  document.querySelectorAll('.card-3d').forEach(card => {
    const inner = card.querySelector('.card-3d-inner');
    const shine = card.querySelector('.card-3d-shine');
    if (!inner) return;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      inner.style.transform = `rotateX(${((y - centerY) / centerY) * -12}deg) rotateY(${((x - centerX) / centerX) * 12}deg)`;
      if (shine) {
        shine.style.setProperty('--shine-x', (x / rect.width) * 100 + '%');
        shine.style.setProperty('--shine-y', (y / rect.height) * 100 + '%');
      }
    });
    card.addEventListener('mouseleave', () => {
      inner.style.transform = 'rotateX(0) rotateY(0)';
    });
    addHoverCursor(card);
  });
}
initTiltCards();

// ===== LATEST DROPS (from index.json product index) =====
async function loadDrops() {
  const grid = document.getElementById('dropsGrid');
  if (!grid) return;

  try {
    const res = await fetch('data/index.json');
    const data = await res.json();

    const latest = [...data.products]
      .filter(p => p.bestPrice && p.bestPrice.amount > 0 && p.image)
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);

    if (latest.length === 0) return;

    grid.innerHTML = latest.map((p) => {
      const priceLabel = p.bestPrice.amount
        ? `${p.bestPrice.currency === 'GBP' ? '\u00A3' : '\u20AC'}${p.bestPrice.amount}`
        : '';
      const storeLabel = p.storeCount === 1 ? '1 store' : `${p.storeCount} stores`;

      return `
        <div class="card-3d" data-tilt>
          <div class="card-3d-inner">
            <div class="card-3d-shine"></div>
            <div class="drop-badge">${p.category || 'Sale'}</div>
            <div class="drop-product-img">
              <img src="${p.image}" alt="${p.name}" loading="lazy"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div class="drop-img-fallback" style="display:none;">${p.brand ? p.brand.charAt(0) : '?'}</div>
            </div>
            <div class="drop-card-brand">${p.brand || ''}</div>
            <h3>${p.name}</h3>
            <p class="drop-region">\u{1F3F7}\u{FE0F} ${storeLabel}</p>
            <div class="drop-card-pricing">
              <span class="drop-price-sale">${priceLabel}</span>
            </div>
            <a href="sales.html?product=${encodeURIComponent(p.productId)}" class="btn btn-outline card-3d-float">Shop \u2192</a>
          </div>
        </div>
      `;
    }).join('');

    initTiltCards();
  } catch (e) {
    console.error('Error loading drops:', e);
  }
}
loadDrops();

// ===== PARTNERS — Floating Marquee (from store-index.json) =====
async function loadPartners() {
  try {
    const response = await fetch('data/store-index.json');
    const data = await response.json();

    const allStores = data.stores.map(s => ({
      name: s.name,
      country: s.country,
      flag: s.flag,
      url: `sales.html?store=${encodeURIComponent(s.slug)}`,
      deal: `${s.categoryIcon} ${s.category}`
    }));

    buildMarquee(allStores);
  } catch (error) {
    console.error('Error loading partners:', error);
  }
}

function buildMarquee(stores) {
  const area = document.getElementById('marqueeArea');
  if (!area) return;

  const shuffled = [...stores].sort(() => Math.random() - 0.5);
  const rowCount = 4;
  const rows = Array.from({ length: rowCount }, () => []);
  shuffled.forEach((store, i) => rows[i % rowCount].push(store));

  rows.forEach((rowStores, rowIndex) => {
    const row = document.createElement('div');
    row.className = `marquee-row ${rowIndex % 2 === 0 ? 'scroll-left' : 'scroll-right'}`;
    row.style.setProperty('--duration', `${50 + rowIndex * 12}s`);

    [...rowStores, ...rowStores].forEach(store => {
      const pill = document.createElement('div');
      pill.className = 'partner-pill';
      pill.innerHTML = `
        <span class="partner-pill-flag">${store.flag}</span>
        <span class="partner-pill-name">${store.name}</span>
        <span class="partner-pill-country">${store.country}</span>
        <span class="partner-pill-deal">${store.deal}</span>
      `;
      pill.addEventListener('click', () => window.open(store.url, '_blank'));
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
