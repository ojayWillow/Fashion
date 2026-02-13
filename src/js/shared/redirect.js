/* ===== FASHION. — Shared Redirect Module ===== */
/* Full-screen redirect overlay with progress bar animation */

function ensureRedirectScreen() {
  if (document.getElementById('redirectScreen')) return;

  const screen = document.createElement('div');
  screen.id = 'redirectScreen';
  screen.className = 'redirect-screen';
  screen.innerHTML = `
    <div class="redirect-screen-content">
      <div class="redirect-logo">FASHION.</div>
      <div class="redirect-spinner">
        <div class="redirect-spinner-ring"></div>
      </div>
      <div class="redirect-status">
        <p class="redirect-heading" id="redirectHeading">Redirecting...</p>
        <p class="redirect-store" id="redirectStore"></p>
        <p class="redirect-domain" id="redirectDomain"></p>
      </div>
      <div class="redirect-progress-bar">
        <div class="redirect-progress-fill" id="redirectProgress"></div>
      </div>
      <p class="redirect-notice">You are being redirected to an external website</p>
    </div>
  `;
  document.body.appendChild(screen);
}

/**
 * Show redirect overlay and open URL in new tab after animation.
 * @param {string} url - The destination URL
 * @param {string} [storeName] - Display name for the store
 * @param {object} [options] - Optional config
 * @param {number} [options.delay=2500] - Delay in ms before opening URL
 */
export function redirectTo(url, storeName, options = {}) {
  const delay = options.delay || 2500;

  ensureRedirectScreen();

  let domain;
  try { domain = new URL(url).hostname; } catch { domain = url; }

  document.getElementById('redirectHeading').textContent = 'Redirecting you to';
  document.getElementById('redirectStore').textContent = storeName || domain;
  document.getElementById('redirectDomain').textContent = domain;

  const screen = document.getElementById('redirectScreen');
  const progressBar = document.getElementById('redirectProgress');

  screen.classList.add('active');
  document.body.style.overflow = 'hidden';

  progressBar.style.width = '0%';
  progressBar.style.transition = 'none';

  requestAnimationFrame(() => {
    const transitionTime = (delay / 1000 - 0.3).toFixed(1);
    progressBar.style.transition = `width ${transitionTime}s cubic-bezier(0.4, 0, 0.2, 1)`;
    progressBar.style.width = '100%';
  });

  setTimeout(() => {
    window.open(url, '_blank');

    screen.classList.add('fade-out');
    setTimeout(() => {
      screen.classList.remove('active', 'fade-out');
      document.body.style.overflow = '';
      progressBar.style.transition = 'none';
      progressBar.style.width = '0%';
    }, 500);
  }, delay);
}
