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

const hoverables = document.querySelectorAll('a, .btn, .ad-banner, .card-3d, .dock-item, .dock-logo, .partner-card');
hoverables.forEach(el => {
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
});

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
});

// ===== Load Partners from JSON and Display =====
let allPartners = [];

async function loadPartners() {
    try {
        const response = await fetch('data/stores.json');
        const data = await response.json();
        
        data.categories.forEach(category => {
            category.stores.forEach(store => {
                allPartners.push({
                    name: store.name,
                    country: store.country,
                    flag: store.flag,
                    url: store.url,
                    lat: store.lat,
                    lng: store.lng
                });
            });
        });
        
        displayPartners();
        initGlobe();
    } catch (error) {
        console.error('Error loading partners:', error);
    }
}

function displayPartners() {
    const topRow = document.querySelector('.partners-row-top');
    const bottomRow = document.querySelector('.partners-row-bottom');
    
    if (!topRow || !bottomRow) return;
    
    topRow.innerHTML = '';
    bottomRow.innerHTML = '';
    
    const half = Math.ceil(allPartners.length / 2);
    
    allPartners.slice(0, half).forEach((partner, index) => {
        topRow.appendChild(createPartnerCard(partner, index));
    });
    
    allPartners.slice(half).forEach((partner, index) => {
        bottomRow.appendChild(createPartnerCard(partner, half + index));
    });
}

function createPartnerCard(partner, index) {
    const card = document.createElement('div');
    card.className = 'partner-card';
    card.dataset.index = index;
    card.innerHTML = `
        <span class="partner-card-emoji">${partner.flag}</span>
        <div class="partner-card-info">
            <strong>${partner.name}</strong>
            <span>${partner.country}</span>
        </div>
        <div class="partner-card-pin"></div>
    `;
    card.addEventListener('click', () => {
        if (partner.lat !== undefined && partner.lng !== undefined) {
            rotateGlobeTo(partner.lat, partner.lng, partner.name);
        } else {
            window.open(partner.url, '_blank');
        }
    });
    return card;
}

loadPartners();

// ===== THREE.JS INTERACTIVE GLOBE =====
let globe = {};

function latLngToVector3(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -(radius * Math.sin(phi) * Math.cos(theta)),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}

function initGlobe() {
    const canvas = document.getElementById('globeCanvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const width = container.clientWidth || 500;
    const height = container.clientHeight || 500;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3.2;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // Globe group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Sphere — dark wireframe
    const sphereGeo = new THREE.SphereGeometry(1, 48, 48);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x1a1a2e,
        wireframe: true,
        transparent: true,
        opacity: 0.15
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(sphere);

    // Solid inner sphere for depth
    const innerGeo = new THREE.SphereGeometry(0.98, 48, 48);
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0x0a0a1a,
        transparent: true,
        opacity: 0.85
    });
    globeGroup.add(new THREE.Mesh(innerGeo, innerMat));

    // Atmosphere glow
    const glowGeo = new THREE.SphereGeometry(1.15, 48, 48);
    const glowMat = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                gl_FragColor = vec4(0.4, 0.2, 1.0, intensity * 0.4);
            }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true
    });
    globeGroup.add(new THREE.Mesh(glowGeo, glowMat));

    // Latitude/longitude grid lines
    const gridMat = new THREE.LineBasicMaterial({ color: 0x6c3ce0, transparent: true, opacity: 0.08 });
    for (let i = -60; i <= 60; i += 30) {
        const points = [];
        for (let j = 0; j <= 360; j += 5) {
            points.push(latLngToVector3(i, j, 1.001));
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        globeGroup.add(new THREE.Line(lineGeo, gridMat));
    }
    for (let j = 0; j < 360; j += 30) {
        const points = [];
        for (let i = -90; i <= 90; i += 5) {
            points.push(latLngToVector3(i, j, 1.001));
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        globeGroup.add(new THREE.Line(lineGeo, gridMat));
    }

    // Store pins
    const pinGroup = new THREE.Group();
    globeGroup.add(pinGroup);

    const pinData = [];
    const placed = [];

    allPartners.forEach(partner => {
        if (partner.lat === undefined) return;
        
        // Offset overlapping pins slightly
        let lat = partner.lat;
        let lng = partner.lng;
        for (const p of placed) {
            if (Math.abs(p.lat - lat) < 1 && Math.abs(p.lng - lng) < 1) {
                lat += (Math.random() - 0.5) * 2;
                lng += (Math.random() - 0.5) * 2;
            }
        }
        placed.push({ lat, lng });

        const pos = latLngToVector3(lat, lng, 1.01);

        // Pin dot
        const dotGeo = new THREE.SphereGeometry(0.015, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(pos);
        pinGroup.add(dot);

        // Pin glow
        const glowPinGeo = new THREE.SphereGeometry(0.03, 8, 8);
        const glowPinMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.3 });
        const glowPin = new THREE.Mesh(glowPinGeo, glowPinMat);
        glowPin.position.copy(pos);
        pinGroup.add(glowPin);

        pinData.push({ partner, dot, glowPin, lat, lng, pos });
    });

    // HTML labels container
    const tooltip = document.getElementById('globeTooltip');

    // Orbiting labels — create floating name labels
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'globe-labels';
    container.appendChild(labelsContainer);

    // Pick a subset of stores to show as orbiting labels (to avoid clutter)
    const labelStores = [];
    const seenCountries = new Set();
    allPartners.forEach(p => {
        if (p.lat !== undefined && !seenCountries.has(p.country) && labelStores.length < 20) {
            labelStores.push(p);
            seenCountries.add(p.country);
        }
    });

    const labelElements = labelStores.map((store, i) => {
        const el = document.createElement('div');
        el.className = 'globe-orbit-label';
        el.textContent = store.name;
        el.addEventListener('click', () => {
            rotateGlobeTo(store.lat, store.lng, store.name);
        });
        labelsContainer.appendChild(el);
        return { el, store, offset: (i / labelStores.length) * Math.PI * 2 };
    });

    // Interaction state
    let autoRotate = true;
    let targetRotationY = null;
    let targetRotationX = null;
    let isDragging = false;
    let prevMouseX = 0, prevMouseY = 0;
    let rotVelX = 0, rotVelY = 0;
    let hoveredPin = null;

    canvas.addEventListener('mouseenter', () => { autoRotate = false; });
    canvas.addEventListener('mouseleave', () => { autoRotate = true; isDragging = false; });
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
        rotVelX = 0;
        rotVelY = 0;
    });
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.clientX - prevMouseX;
            const dy = e.clientY - prevMouseY;
            globeGroup.rotation.y += dx * 0.005;
            globeGroup.rotation.x += dy * 0.005;
            globeGroup.rotation.x = Math.max(-1, Math.min(1, globeGroup.rotation.x));
            rotVelX = dy * 0.005;
            rotVelY = dx * 0.005;
            prevMouseX = e.clientX;
            prevMouseY = e.clientY;
            targetRotationY = null;
            targetRotationX = null;
        }

        // Hover detection for pins
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(pinData.map(p => p.dot));
        
        if (hits.length > 0) {
            const hit = pinData.find(p => p.dot === hits[0].object);
            if (hit) {
                hoveredPin = hit;
                tooltip.style.display = 'block';
                tooltip.textContent = `${hit.partner.flag} ${hit.partner.name} — ${hit.partner.country}`;
                tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
                tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
                hit.dot.material.color.setHex(0xffffff);
                hit.dot.scale.setScalar(2);
                canvas.style.cursor = 'pointer';
            }
        } else {
            if (hoveredPin) {
                hoveredPin.dot.material.color.setHex(0xa855f7);
                hoveredPin.dot.scale.setScalar(1);
                hoveredPin = null;
            }
            tooltip.style.display = 'none';
            canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
    });

    canvas.addEventListener('click', () => {
        if (hoveredPin) {
            window.open(hoveredPin.partner.url, '_blank');
        }
    });

    // Rotate globe to a specific lat/lng
    window.rotateGlobeTo = function(lat, lng, name) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lng + 180) * (Math.PI / 180);
        targetRotationY = -theta + Math.PI;
        targetRotationX = phi - Math.PI / 2;
        autoRotate = false;

        // Highlight the pin
        pinData.forEach(p => {
            p.dot.material.color.setHex(0xa855f7);
            p.dot.scale.setScalar(1);
            p.glowPin.material.opacity = 0.3;
        });
        const target = pinData.find(p => p.partner.name === name);
        if (target) {
            target.dot.material.color.setHex(0x00ff88);
            target.dot.scale.setScalar(3);
            target.glowPin.material.opacity = 0.8;
            target.glowPin.material.color.setHex(0x00ff88);
            setTimeout(() => {
                target.dot.material.color.setHex(0xa855f7);
                target.dot.scale.setScalar(1);
                target.glowPin.material.opacity = 0.3;
                target.glowPin.material.color.setHex(0xa855f7);
                autoRotate = true;
            }, 3000);
        }

        setTimeout(() => { autoRotate = true; }, 4000);
    };

    // Pulse animation for pins
    let pulseTime = 0;

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        pulseTime += 0.02;

        if (autoRotate) {
            globeGroup.rotation.y += 0.003;
        }

        // Smooth rotation to target
        if (targetRotationY !== null) {
            const diffY = targetRotationY - globeGroup.rotation.y;
            globeGroup.rotation.y += diffY * 0.05;
            if (Math.abs(diffY) < 0.01) targetRotationY = null;
        }
        if (targetRotationX !== null) {
            const diffX = targetRotationX - globeGroup.rotation.x;
            globeGroup.rotation.x += diffX * 0.05;
            if (Math.abs(diffX) < 0.01) targetRotationX = null;
        }

        // Inertia when not dragging
        if (!isDragging && !autoRotate && targetRotationY === null) {
            globeGroup.rotation.y += rotVelY;
            globeGroup.rotation.x += rotVelX;
            rotVelX *= 0.95;
            rotVelY *= 0.95;
        }

        // Pulse pins
        pinData.forEach((p, i) => {
            const pulse = Math.sin(pulseTime + i * 0.5) * 0.5 + 0.5;
            p.glowPin.scale.setScalar(1 + pulse * 0.5);
        });

        // Update orbiting labels
        labelElements.forEach((item, i) => {
            const angle = item.offset + pulseTime * 0.3;
            const radius3D = 1.3;
            const pos3D = new THREE.Vector3(
                Math.cos(angle) * radius3D,
                (Math.sin(angle * 0.7 + i) * 0.4),
                Math.sin(angle) * radius3D
            );
            pos3D.applyEuler(globeGroup.rotation);
            
            const projected = pos3D.clone().project(camera);
            const x = (projected.x * 0.5 + 0.5) * width;
            const y = (-projected.y * 0.5 + 0.5) * height;
            
            item.el.style.left = x + 'px';
            item.el.style.top = y + 'px';
            
            // Fade based on z-depth (behind globe = hidden)
            const opacity = pos3D.z > 0 ? Math.min(1, pos3D.z * 1.5) : 0;
            item.el.style.opacity = opacity;
            item.el.style.pointerEvents = opacity > 0.3 ? 'auto' : 'none';
        });

        renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    window.addEventListener('resize', () => {
        const w = container.clientWidth || 500;
        const h = container.clientHeight || 500;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

    globe = { scene, camera, renderer, globeGroup, pinData };
}

// ===== Scroll Reveal Animations =====
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add('visible'), i * 80);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.ad-banner, .card-3d, .brand-category, .partner-card').forEach(el => observer.observe(el));

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