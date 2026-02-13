/* ===== FASHION. — Shared Cursor Module ===== */
/* Custom following-pointer cursor used across all pages */

export function initCursor() {
  const cursorDot = document.getElementById('cursorDot');
  const cursorRing = document.getElementById('cursorRing');

  if (!cursorDot || !cursorRing) return { addHoverCursor: () => {} };

  // Skip custom cursor on touch devices
  if (!window.matchMedia('(pointer: fine)').matches) {
    cursorDot.style.display = 'none';
    cursorRing.style.display = 'none';
    return { addHoverCursor: () => {} };
  }

  let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

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

  function addHoverCursor(el) {
    if (!el) return;
    el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
  }

  // Auto-attach to common interactive elements already in the DOM
  document.querySelectorAll('a, .btn, .dock-item, .dock-logo').forEach(addHoverCursor);

  return { addHoverCursor };
}
