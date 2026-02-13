/* ===== FASHION. — Shared Dock Module ===== */
/* macOS-style floating dock with magnification + scroll auto-hide */

export function initDock(addHoverCursor) {
  const dock = document.getElementById('floatingDock');
  const dockItems = document.querySelectorAll('.dock-item');

  if (!dock || dockItems.length === 0) return;

  // Neighbor magnification on hover
  dockItems.forEach((item, index) => {
    item.addEventListener('mouseenter', () => {
      if (dockItems[index - 1]) dockItems[index - 1].classList.add('neighbor');
      if (dockItems[index + 1]) dockItems[index + 1].classList.add('neighbor');
    });
    item.addEventListener('mouseleave', () => {
      dockItems.forEach(i => i.classList.remove('neighbor'));
    });
  });

  // Auto-hide on scroll down, show on scroll up
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
}
