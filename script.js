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

// ===== Interactive Globe — REBUILT =====
// Partner data with accurate lat/lng
const PARTNERS = [
    { lat: 45.52, lng: -122.68, name: 'Nike', city: 'Portland, USA', emoji: '👟' },
    { lat: 54.97, lng: -1.61,   name: 'END. Clothing', city: 'Newcastle, UK', emoji: '🏴' },
    { lat: 45.50, lng: -73.57,  name: 'SSENSE', city: 'Montreal, Canada', emoji: '👑' },
    { lat: 41.15, lng: -8.61,   name: 'Farfetch', city: 'Porto, Portugal', emoji: '💎' },
    { lat: 52.52, lng: 13.40,   name: 'Zalando', city: 'Berlin, Germany', emoji: '🔵' },
    { lat: 42.33, lng: -83.05,  name: 'StockX', city: 'Detroit, USA', emoji: '✅' },
    { lat: 45.46, lng: 9.19,    name: 'Slam Jam', city: 'Milan, Italy', emoji: '🇮🇹' },
    { lat: 51.51, lng: -0.13,   name: 'ASOS', city: 'London, UK', emoji: '⚡' },
    { lat: 52.50, lng: 13.42,   name: 'Solebox', city: 'Berlin, Germany', emoji: '📦' },
    { lat: 34.05, lng: -118.24, name: 'GOAT', city: 'Los Angeles, USA', emoji: '🐐' },
    { lat: 35.68, lng: 139.69,  name: 'Atmos', city: 'Tokyo, Japan', emoji: '🇯🇵' },
    { lat: 48.14, lng: 11.58,   name: 'Mytheresa', city: 'Munich, Germany', emoji: '🛍️' },
];

let globeGroup = null;
let globeCamera = null;
let globeRenderer = null;
let targetRotationX = 0;
let targetRotationY = 0;
let isAnimatingToTarget = false;
let autoRotate = true;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let rotationVelocity = { x: 0, y: 0 };
let dotMeshes = [];
let hoveredDot = null;
let activePartnerIndex = -1;

function latLngToVector3(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}

// Calculate the globe rotation needed to face a lat/lng toward camera
function latLngToRotation(lat, lng) {
    const targetY = -lng * (Math.PI / 180) + Math.PI;
    const targetX = -lat * (Math.PI / 180) * 0.3; // subtle tilt
    return { x: targetX, y: targetY };
}

// Spin globe to a specific partner AND scroll globe to center of viewport
function focusPartner(index) {
    if (index < 0 || index >= PARTNERS.length) return;
    const p = PARTNERS[index];
    const rot = latLngToRotation(p.lat, p.lng);
    targetRotationX = rot.x;
    targetRotationY = rot.y;
    isAnimatingToTarget = true;
    autoRotate = false;
    activePartnerIndex = index;

    // Highlight the card
    document.querySelectorAll('.partner-card').forEach((card, i) => {
        card.classList.toggle('partner-active', i === index);
    });

    // Scroll the globe into the dead center of the viewport
    const globeEl = document.querySelector('.globe-container');
    if (globeEl) {
        const rect = globeEl.getBoundingClientRect();
        const globeCenterY = rect.top + window.scrollY + rect.height / 2;
        const viewportCenterY = window.innerHeight / 2;
        const scrollTarget = globeCenterY - viewportCenterY;
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }

    // Re-enable auto-rotate after 5 seconds
    clearTimeout(window._globeAutoTimer);
    window._globeAutoTimer = setTimeout(() => {
        autoRotate = true;
        isAnimatingToTarget = false;
    }, 5000);
}

function initGlobe() {
    const canvas = document.getElementById('globeCanvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const width = container.offsetWidth;
    const height = container.offsetHeight || width;

    const scene = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    globeCamera.position.z = 2.8;

    globeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    globeRenderer.setSize(width, height);
    globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    globeRenderer.setClearColor(0x000000, 0);

    // Globe group — everything rotates together
    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Main sphere
    const globeGeo = new THREE.SphereGeometry(1, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
        color: 0x110a1f,
        emissive: 0x1a0a2e,
        emissiveIntensity: 0.5,
        shininess: 30,
        transparent: true,
        opacity: 0.93,
    });
    globeGroup.add(new THREE.Mesh(globeGeo, globeMat));

    // Wireframe
    const wireGeo = new THREE.SphereGeometry(1.003, 40, 40);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x7c3aed, wireframe: true, transparent: true, opacity: 0.07,
    });
    globeGroup.add(new THREE.Mesh(wireGeo, wireMat));

    // Atmosphere
    const atmosGeo = new THREE.SphereGeometry(1.2, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7, transparent: true, opacity: 0.035, side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(atmosGeo, atmosMat));

    // Partner dots
    dotMeshes = [];
    PARTNERS.forEach((p, idx) => {
        const pos = latLngToVector3(p.lat, p.lng, 1.02);

        // Main dot
        const dotGeo = new THREE.SphereGeometry(0.025, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(pos);
        dot.userData = { partnerIndex: idx, name: p.name, city: p.city };
        globeGroup.add(dot);
        dotMeshes.push(dot);

        // Pulse ring
        const pulseGeo = new THREE.RingGeometry(0.03, 0.055, 32);
        const pulseMat = new THREE.MeshBasicMaterial({
            color: 0xa855f7, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
        });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        pulse.position.copy(pos);
        pulse.lookAt(new THREE.Vector3(0, 0, 0));
        pulse.userData.isPulse = true;
        globeGroup.add(pulse);

        // Pin stem
        const stemDir = pos.clone().normalize();
        const stemEnd = pos.clone().add(stemDir.clone().multiplyScalar(0.07));
        const stemGeo = new THREE.BufferGeometry().setFromPoints([pos, stemEnd]);
        const stemMat = new THREE.LineBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.5 });
        globeGroup.add(new THREE.Line(stemGeo, stemMat));
    });

    // Arcs
    const arcPairs = [[0,5],[1,7],[2,0],[3,6],[4,8],[9,10],[6,11],[7,3],[10,2],[5,9]];
    arcPairs.forEach(([i, j]) => {
        const start = latLngToVector3(PARTNERS[i].lat, PARTNERS[i].lng, 1.02);
        const end = latLngToVector3(PARTNERS[j].lat, PARTNERS[j].lng, 1.02);
        const dist = start.distanceTo(end);
        const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(1.0 + dist * 0.3);
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
        const arcMat = new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.15 });
        globeGroup.add(new THREE.Line(arcGeo, arcMat));
    });

    // Lights
    scene.add(new THREE.AmbientLight(0x606080, 0.6));
    const dirLight = new THREE.DirectionalLight(0xa855f7, 0.5);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);
    const ptLight = new THREE.PointLight(0x7c3aed, 0.5, 100);
    ptLight.position.set(-5, -3, 3);
    scene.add(ptLight);

    // Tooltip
    const tooltip = document.getElementById('globeTooltip');

    // Raycaster for hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, globeCamera);
        const intersects = raycaster.intersectObjects(dotMeshes);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            if (hoveredDot !== hit) {
                if (hoveredDot) { hoveredDot.material.color.setHex(0xc084fc); hoveredDot.scale.set(1,1,1); }
                hoveredDot = hit;
                hit.material.color.setHex(0xffffff);
                hit.scale.set(2, 2, 2);
            }
            if (tooltip) {
                tooltip.innerHTML = `<strong>${hit.userData.name}</strong><br><span>${hit.userData.city}</span>`;
                tooltip.style.opacity = '1';
                tooltip.style.left = (e.clientX - rect.left) + 'px';
                tooltip.style.top = (e.clientY - rect.top - 50) + 'px';
            }
            canvas.style.cursor = 'pointer';
        } else {
            if (hoveredDot) {
                hoveredDot.material.color.setHex(0xc084fc);
                hoveredDot.scale.set(1,1,1);
                hoveredDot = null;
            }
            if (tooltip) tooltip.style.opacity = '0';
            canvas.style.cursor = 'grab';
        }

        // Drag
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            rotationVelocity.x = deltaY * 0.004;
            rotationVelocity.y = deltaX * 0.004;
            previousMousePosition = { x: e.clientX, y: e.clientY };
            isAnimatingToTarget = false;
            autoRotate = false;
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
        // Click on dot
        if (hoveredDot) {
            focusPartner(hoveredDot.userData.partnerIndex);
        }
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        if (hoveredDot) {
            hoveredDot.material.color.setHex(0xc084fc);
            hoveredDot.scale.set(1,1,1);
            hoveredDot = null;
        }
        if (tooltip) tooltip.style.opacity = '0';
    });

    // Clock for pulse animation
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();

        if (isAnimatingToTarget) {
            // Smoothly interpolate to target rotation
            globeGroup.rotation.x += (targetRotationX - globeGroup.rotation.x) * 0.04;
            globeGroup.rotation.y += (targetRotationY - globeGroup.rotation.y) * 0.04;
        } else if (autoRotate && !isDragging) {
            globeGroup.rotation.y += 0.002;
        }

        // Apply drag momentum
        if (!isAnimatingToTarget) {
            globeGroup.rotation.x += rotationVelocity.x;
            globeGroup.rotation.y += rotationVelocity.y;
            rotationVelocity.x *= 0.94;
            rotationVelocity.y *= 0.94;
        }

        // Pulse rings
        globeGroup.children.forEach(child => {
            if (child.userData && child.userData.isPulse) {
                const s = 1 + 0.35 * Math.sin(elapsed * 2.2);
                child.scale.set(s, s, s);
                child.material.opacity = 0.25 + 0.2 * Math.sin(elapsed * 2.2);
            }
        });

        globeRenderer.render(scene, globeCamera);
    }
    animate();

    window.addEventListener('resize', () => {
        const w = container.offsetWidth;
        const h = container.offsetHeight || w;
        globeCamera.aspect = w / h;
        globeCamera.updateProjectionMatrix();
        globeRenderer.setSize(w, h);
    });
}

// Partner card click → spin globe AND scroll globe to center
document.querySelectorAll('.partner-card').forEach((card, idx) => {
    card.addEventListener('click', () => {
        focusPartner(idx);
    });
});

// Lazy-load globe
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
