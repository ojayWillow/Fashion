// ===== Homepage JavaScript: Load and display stores by category =====

let storesData = null;

async function loadStores() {
    try {
        const response = await fetch('data/stores.json');
        storesData = await response.json();
        displayStores();
    } catch (error) {
        console.error('Error loading stores:', error);
    }
}

function displayStores() {
    if (!storesData) return;

    const storesContainer = document.getElementById('storesContainer');
    if (!storesContainer) return;

    storesContainer.innerHTML = '';

    storesData.categories.forEach(category => {
        const categorySection = document.createElement('div');
        categorySection.className = 'category-section';
        categorySection.innerHTML = `
            <div class="category-header">
                <span class="category-icon">${category.icon}</span>
                <h2 class="category-title">${category.name}</h2>
            </div>
            <div class="store-grid" id="grid-${category.name.replace(/\s+/g, '-').toLowerCase()}"></div>
        `;
        storesContainer.appendChild(categorySection);

        const grid = categorySection.querySelector('.store-grid');
        category.stores.forEach(store => {
            const storeCard = createStoreCard(store);
            grid.appendChild(storeCard);
        });
    });

    // Update last updated date
    const updateInfo = document.getElementById('lastUpdated');
    if (updateInfo) {
        updateInfo.textContent = `Last updated: ${storesData.lastUpdated}`;
    }
}

function createStoreCard(store) {
    const card = document.createElement('div');
    card.className = 'store-card';
    card.innerHTML = `
        <div class="store-header">
            <div>
                <h3 class="store-name">${store.name}</h3>
                <p class="store-country">${store.flag} ${store.country}</p>
            </div>
        </div>
        <p class="store-description">${store.description}</p>
        ${store.currentDeal ? `<span class="store-deal">💰 ${store.currentDeal}</span>` : ''}
        <div class="store-actions">
            <a href="${store.url}" target="_blank" class="btn btn-outline btn-sm">Visit Store →</a>
            ${store.saleUrl ? `<a href="${store.saleUrl}" target="_blank" class="btn btn-glow btn-sm">View Sale</a>` : ''}
        </div>
    `;
    return card;
}

// Text flip animation for hero
function initTextFlip() {
    const wrapper = document.getElementById('textFlipWrapper');
    if (!wrapper) return;

    const words = wrapper.querySelectorAll('.text-flip-word');
    let currentIndex = 0;

    setInterval(() => {
        words[currentIndex].classList.remove('active');
        currentIndex = (currentIndex + 1) % words.length;
        words[currentIndex].classList.add('active');
        wrapper.style.transform = `translateY(-${currentIndex * 100}%)`;
    }, 3000);
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadStores();
        initTextFlip();
    });
} else {
    loadStores();
    initTextFlip();
}