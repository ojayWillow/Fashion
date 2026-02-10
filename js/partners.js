// ===== Partners Page JavaScript =====

let partnersData = null;
let currentFilter = 'all';

// Logo URLs mapping (using logo.clearbit.com for brand logos)
const getLogoUrl = (storeName, storeUrl) => {
    try {
        const domain = new URL(storeUrl).hostname.replace('www.', '');
        return `https://logo.clearbit.com/${domain}`;
    } catch {
        return null;
    }
};

// Category mapping
const categoryMap = {
    'Major Marketplaces': 'marketplace',
    'Fast Fashion & High Street': 'fashion',
    'Premium & Designer': 'premium',
    'Luxury Platforms': 'luxury',
    'Department Stores': 'department',
    'Sustainable Fashion': 'sustainable',
    'Scandinavian Designers': 'scandinavian',
    'Sneaker & Streetwear': 'streetwear',
    'Resale & Vintage': 'resale'
};

async function loadPartners() {
    try {
        const response = await fetch('data/stores.json');
        partnersData = await response.json();
        displayPartners();
        initFilters();
    } catch (error) {
        console.error('Error loading partners:', error);
    }
}

function displayPartners() {
    if (!partnersData) return;

    const grid = document.getElementById('partnersGrid');
    if (!grid) return;

    grid.innerHTML = '';

    partnersData.categories.forEach(category => {
        const categoryClass = categoryMap[category.name] || 'other';
        
        category.stores.forEach(store => {
            const card = createPartnerCard(store, categoryClass);
            grid.appendChild(card);
        });
    });

    // Trigger scroll animation
    setTimeout(() => {
        document.querySelectorAll('.partner-logo-card').forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('visible');
            }, index * 30);
        });
    }, 100);
}

function createPartnerCard(store, categoryClass) {
    const card = document.createElement('a');
    card.href = store.url;
    card.target = '_blank';
    card.className = `partner-logo-card ${categoryClass}`;
    card.dataset.category = categoryClass;

    const logoUrl = getLogoUrl(store.name, store.url);

    card.innerHTML = `
        <div class="partner-logo">
            ${logoUrl ? 
                `<img src="${logoUrl}" alt="${store.name}" onerror="this.parentElement.innerHTML='<div class=\"partner-logo-text\">${store.name}</div>'" loading="lazy">` : 
                `<div class="partner-logo-text">${store.name}</div>`
            }
        </div>
        <div class="partner-info">
            <h3 class="partner-name">${store.name}</h3>
            <p class="partner-country">${store.flag} ${store.country}</p>
        </div>
    `;

    return card;
}

function initFilters() {
    const filterTabs = document.querySelectorAll('.filter-tab');
    
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const category = tab.dataset.category;
            
            // Update active state
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Filter partners
            filterPartners(category);
        });
    });
}

function filterPartners(category) {
    currentFilter = category;
    const cards = document.querySelectorAll('.partner-logo-card');
    
    cards.forEach(card => {
        if (category === 'all' || card.dataset.category === category) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPartners);
} else {
    loadPartners();
}