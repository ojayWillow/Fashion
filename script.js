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

// Cursor hover effects on interactive elements
const hoverables = document.querySelectorAll('a, .btn, .ad-banner, .card-3d, .dock-item, .dock-logo, .partner-item');
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
        const x = e.clientX - rect.left - 100;
        const y = e.clientY - rect.top - 100;
        trail.style.left = x + 'px';
        trail.style.top = y + 'px';
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

        const rotateX = ((y - centerY) / centerY) * -12;
        const rotateY = ((x - centerX) / centerX) * 12;

        inner.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

        const shineX = (x / rect.width) * 100;
        const shineY = (y / rect.height) * 100;
        shine.style.setProperty('--shine-x', shineX + '%');
        shine.style.setProperty('--shine-y', shineY + '%');
    });

    card.addEventListener('mouseleave', () => {
        inner.style.transform = 'rotateX(0) rotateY(0)';
    });
});

// ===== Interactive Globe (Three.js) — Rebuilt =====
function initGlobe() {
    const canvas = document.getElementById('globeCanvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const width = container.offsetWidth;
    const height = container.offsetHeight || width;

    // — Scene, Camera, Renderer —
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 2.8;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // — Globe group: everything that rotates together —
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Main sphere
    const globeGeo = new THREE.SphereGeometry(1, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
        color: 0x0f0f18,
        emissive: 0x1a0a2e,
        emissiveIntensity: 0.4,
        shininess: 25,
        transparent: true,
        opacity: 0.92,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    globeGroup.add(globe);

    // Wireframe overlay
    const wireGeo = new THREE.SphereGeometry(1.003, 40, 40);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        wireframe: true,
        transparent: true,
        opacity: 0.07,
    });
    const wireframe = new THREE.Mesh(wireGeo, wireMat);
    globeGroup.add(wireframe);

    // Atmosphere glow
    const atmosGeo = new THREE.SphereGeometry(1.18, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.04,
        side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere); // atmosphere doesn't need to rotate

    // — Partner data with accurate coordinates —
    const partners = [
        { lat: 45.52, lng: -122.68, name: 'Nike', city: 'Portland, USA' },
        { lat: 54.97, lng: -1.61,   name: 'END. Clothing', city: 'Newcastle, UK' },
        { lat: 45.50, lng: -73.57,  name: 'SSENSE', city: 'Montreal, Canada' },
        { lat: 41.15, lng: -8.61,   name: 'Farfetch', city: 'Porto, Portugal' },
        { lat: 52.52, lng: 13.40,   name: 'Zalando', city: 'Berlin, Germany' },
        { lat: 42.33, lng: -83.05,  name: 'StockX', city: 'Detroit, USA' },
        { lat: 45.46, lng: 9.19,    name: 'Slam Jam', city: 'Milan, Italy' },
        { lat: 51.51, lng: -0.13,   name: 'ASOS', city: 'London, UK' },
        { lat: 52.50, lng: 13.42,   name: 'Solebox', city: 'Berlin, Germany' },
        { lat: 34.05, lng: -118.24, name: 'GOAT', city: 'Los Angeles, USA' },
        { lat: 35.68, lng: 139.69,  name: 'Atmos', city: 'Tokyo, Japan' },
        { lat: 48.14, lng: 11.58,   name: 'Mytheresa', city: 'Munich, Germany' },
    ];

    // Convert lat/lng to 3D position on sphere surface
    function latLngToVector3(lat, lng, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lng + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    // — Create partner dots & pulse rings on the globe surface —
    const dotMeshes = []; // for raycasting

    partners.forEach((p, idx) => {
        const pos = latLngToVector3(p.lat, p.lng, 1.015);

        // Glowing dot
        const dotGeo = new THREE.SphereGeometry(0.022, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(pos);
        dot.userData = { partnerIndex: idx, name: p.name, city: p.city };
        globeGroup.add(dot);
        dotMeshes.push(dot);

        // Pulsing ring around dot
        const pulseGeo = new THREE.RingGeometry(0.025, 0.045, 32);
        const pulseMat = new THREE.MeshBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        pulse.position.copy(pos);
        pulse.lookAt(new THREE.Vector3(0, 0, 0));
        pulse.userData.isPulse = true;
        pulse.userData.baseScale = 1;
        globeGroup.add(pulse);

        // Small vertical line (pin stem) from surface upward
        const stemLength = 0.06;
        const stemDir = pos.clone().normalize();
        const stemStart = pos.clone();
        const stemEnd = pos.clone().add(stemDir.multiplyScalar(stemLength));
        const stemGeo = new THREE.BufferGeometry().setFromPoints([stemStart, stemEnd]);
        const stemMat = new THREE.LineBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.6 });
        const stem = new THREE.Line(stemGeo, stemMat);
        globeGroup.add(stem);
    });

    // — Arcs connecting partner pairs —
    const arcPairs = [
        [0, 5],  // Nike ↔ StockX
        [1, 7],  // END ↔ ASOS
        [2, 0],  // SSENSE ↔ Nike
        [3, 6],  // Farfetch ↔ Slam Jam
        [4, 8],  // Zalando ↔ Solebox
        [9, 10], // GOAT ↔ Atmos
        [6, 11], // Slam Jam ↔ Mytheresa
        [7, 3],  // ASOS ↔ Farfetch
        [10, 2], // Atmos ↔ SSENSE
        [5, 9],  // StockX ↔ GOAT
    ];

    arcPairs.forEach(([i, j]) => {
        const start = latLngToVector3(partners[i].lat, partners[i].lng, 1.015);
        const end = latLngToVector3(partners[j].lat, partners[j].lng, 1.015);

        // Arc height scales with distance between points
        const dist = start.distanceTo(end);
        const arcHeight = 1.0 + dist * 0.35;
        const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(arcHeight);

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const points = curve.getPoints(48);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
        const arcMat = new THREE.LineBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.18,
        });
        const arc = new THREE.Line(arcGeo, arcMat);
        globeGroup.add(arc);
    });

    // — Lighting —
    const ambientLight = new THREE.AmbientLight(0x606080, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xa855f7, 0.5);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x7c3aed, 0.5, 100);
    pointLight.position.set(-5, -3, 3);
    scene.add(pointLight);

    // — Tooltip label (HTML overlay) —
    const tooltip = document.getElementById('globeTooltip');

    // — Raycaster for hover detection —
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.05 };
    const mouse = new THREE.Vector2();
    let hoveredDot = null;

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(dotMeshes);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            if (hoveredDot !== hit) {
                hoveredDot = hit;
                // Highlight
                hit.material.color.setHex(0xffffff);
                hit.scale.set(1.8, 1.8, 1.8);
            }
            // Position tooltip
            if (tooltip) {
                tooltip.textContent = hit.userData.name + ' — ' + hit.userData.city;
                tooltip.style.opacity = '1';
                tooltip.style.left = (e.clientX - rect.left) + 'px';
                tooltip.style.top = (e.clientY - rect.top - 40) + 'px';
            }
        } else {
            if (hoveredDot) {
                hoveredDot.material.color.setHex(0xc084fc);
                hoveredDot.scale.set(1, 1, 1);
                hoveredDot = null;
            }
            if (tooltip) {
                tooltip.style.opacity = '0';
            }
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (hoveredDot) {
            hoveredDot.material.color.setHex(0xc084fc);
            hoveredDot.scale.set(1, 1, 1);
            hoveredDot = null;
        }
        if (tooltip) tooltip.style.opacity = '0';
    });

    // — Click to highlight partner in list —
    canvas.addEventListener('click', (e) => {
        if (hoveredDot) {
            const idx = hoveredDot.userData.partnerIndex;
            const partnerItems = document.querySelectorAll('.partner-item');
            // Remove previous highlights
            partnerItems.forEach(p => p.classList.remove('partner-active'));
            // Highlight clicked one
            if (partnerItems[idx]) {
                partnerItems[idx].classList.add('partner-active');
                partnerItems[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    });

    // — Drag to rotate —
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let rotationVelocity = { x: 0, y: 0 };

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        rotationVelocity.x = deltaY * 0.004;
        rotationVelocity.y = deltaX * 0.004;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);

    // — Pulse animation clock —
    const clock = new THREE.Clock();

    // — Animate —
    function animate() {
        requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();

        // Auto-rotate when not dragging
        if (!isDragging) {
            globeGroup.rotation.y += 0.002;
        }

        // Apply drag momentum
        globeGroup.rotation.x += rotationVelocity.x;
        globeGroup.rotation.y += rotationVelocity.y;
        rotationVelocity.x *= 0.94;
        rotationVelocity.y *= 0.94;

        // Animate pulse rings
        globeGroup.children.forEach(child => {
            if (child.userData && child.userData.isPulse) {
                const s = 1 + 0.3 * Math.sin(elapsed * 2.5);
                child.scale.set(s, s, s);
                child.material.opacity = 0.3 + 0.2 * Math.sin(elapsed * 2.5);
            }
        });

        renderer.render(scene, camera);
    }

    animate();

    // — Resize handler —
    window.addEventListener('resize', () => {
        const w = container.offsetWidth;
        const h = container.offsetHeight || w;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
}

// Lazy-load globe when section scrolls into view
const globeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            initGlobe();
            globeObserver.disconnect();
        }
    });
}, { threshold: 0.1 });

const globeSection = document.getElementById('partners');
if (globeSection) globeObserver.observe(globeSection);

// ===== Scroll Reveal Animations =====
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
            setTimeout(() => {
                entry.target.classList.add('visible');
            }, i * 80);
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

document.querySelectorAll('.ad-banner, .card-3d, .brand-category, .partner-item').forEach(el => {
    observer.observe(el);
});

// ===== Dock auto-hide on scroll down, show on scroll up =====
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
