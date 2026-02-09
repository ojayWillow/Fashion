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

// ===== Interactive Globe (Three.js) =====
function initGlobe() {
    const canvas = document.getElementById('globeCanvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    const width = container.offsetWidth;
    const height = container.offsetHeight || width;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 2.5;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const globeGeo = new THREE.SphereGeometry(1, 48, 48);
    const globeMat = new THREE.MeshPhongMaterial({
        color: 0x13131d,
        emissive: 0x1a0a2e,
        emissiveIntensity: 0.3,
        shininess: 20,
        transparent: true,
        opacity: 0.9,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    const wireGeo = new THREE.SphereGeometry(1.002, 36, 36);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        wireframe: true,
        transparent: true,
        opacity: 0.08,
    });
    const wireframe = new THREE.Mesh(wireGeo, wireMat);
    scene.add(wireframe);

    const atmosGeo = new THREE.SphereGeometry(1.15, 48, 48);
    const atmosMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.04,
        side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);

    const partners = [
        { lat: 45.52, lng: -122.68, name: 'Nike' },
        { lat: 54.97, lng: -1.61, name: 'END.' },
        { lat: 45.50, lng: -73.57, name: 'SSENSE' },
        { lat: 41.15, lng: -8.61, name: 'Farfetch' },
        { lat: 52.52, lng: 13.40, name: 'Zalando' },
        { lat: 42.33, lng: -83.05, name: 'StockX' },
        { lat: 45.46, lng: 9.19, name: 'Slam Jam' },
        { lat: 51.51, lng: -0.13, name: 'ASOS' },
        { lat: 52.52, lng: 13.40, name: 'Solebox' },
        { lat: 34.05, lng: -118.24, name: 'GOAT' },
        { lat: 35.68, lng: 139.69, name: 'Atmos' },
        { lat: 48.14, lng: 11.58, name: 'Mytheresa' },
    ];

    function latLngToVector3(lat, lng, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lng + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    partners.forEach(p => {
        const pos = latLngToVector3(p.lat, p.lng, 1.02);
        const dotGeo = new THREE.SphereGeometry(0.02, 12, 12);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(pos);
        scene.add(dot);

        const ringGeo = new THREE.RingGeometry(0.03, 0.05, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xc084fc,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(0, 0, 0);
        scene.add(ring);
    });

    const arcPairs = [
        [0, 5], [1, 7], [2, 0], [3, 6], [4, 8],
        [9, 10], [6, 11], [7, 3], [10, 2], [5, 9]
    ];

    arcPairs.forEach(([i, j]) => {
        const start = latLngToVector3(partners[i].lat, partners[i].lng, 1.02);
        const end = latLngToVector3(partners[j].lat, partners[j].lng, 1.02);
        const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(1.3);

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const arcGeo = new THREE.TubeGeometry(curve, 32, 0.004, 8, false);
        const arcMat = new THREE.MeshBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.25,
        });
        const arc = new THREE.Mesh(arcGeo, arcMat);
        scene.add(arc);
    });

    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xa855f7, 0.4);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x7c3aed, 0.6, 100);
    pointLight.position.set(-5, -3, 2);
    scene.add(pointLight);

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
        rotationVelocity.x = deltaY * 0.005;
        rotationVelocity.y = deltaX * 0.005;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);

    function animate() {
        requestAnimationFrame(animate);

        if (!isDragging) {
            globe.rotation.y += 0.003;
            wireframe.rotation.y += 0.003;
        }

        globe.rotation.x += rotationVelocity.x;
        globe.rotation.y += rotationVelocity.y;
        wireframe.rotation.x = globe.rotation.x;
        wireframe.rotation.y = globe.rotation.y;

        rotationVelocity.x *= 0.95;
        rotationVelocity.y *= 0.95;

        renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
        const w = container.offsetWidth;
        const h = container.offsetHeight || w;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
}

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
        // Scrolling down — hide dock upwards
        dock.style.transform = 'translateX(-50%) translateY(-100px)';
        dock.style.opacity = '0';
    } else {
        // Scrolling up — show dock
        dock.style.transform = 'translateX(-50%) translateY(0)';
        dock.style.opacity = '1';
    }
    lastScroll = currentScroll;
});
