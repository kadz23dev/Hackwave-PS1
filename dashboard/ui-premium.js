/**
 * KAIZEN AI — PREMIUM UI/UX INTERACTIONS v4.0
 * Mouse Gradient · Ripple · Cursor Glow · Smooth Navigation
 * 100% Air-Gapped Compliant · High-Performance Micro-Interactions
 */

'use strict';

/* ─── 1. MOUSE GRADIENT TRACKER ─── */
(function initMouseGradient() {
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;
  let ticking = false;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function update() {
    currentX = lerp(currentX, targetX, 0.1);
    currentY = lerp(currentY, targetY, 0.1);

    document.documentElement.style.setProperty('--mouse-x', `${Math.round(currentX)}px`);
    document.documentElement.style.setProperty('--mouse-y', `${Math.round(currentY)}px`);

    if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
      requestAnimationFrame(update);
    } else {
      ticking = false;
    }
  }

  document.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
})();

/* ─── 2. CURSOR GLOW ─── */
(function initCursorGlow() {
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.appendChild(glow);

  let targetX = -100;
  let targetY = -100;
  let currentX = -100;
  let currentY = -100;
  let ticking = false;

  function updateGlow() {
    currentX += (targetX - currentX) * 0.2;
    currentY += (targetY - currentY) * 0.2;
    glow.style.left = `${Math.round(currentX)}px`;
    glow.style.top = `${Math.round(currentY)}px`;

    if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
      requestAnimationFrame(updateGlow);
    } else {
      ticking = false;
    }
  }

  document.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateGlow);
    }
  }, { passive: true });
})();

/* ─── 3. RIPPLE EFFECT ON BUTTONS ─── */
(function initRipple() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .tab-pill, .suggestion-chip');
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      top: ${y}px;
      left: ${x}px;
      width: 4px;
      height: 4px;
      background: var(--glass-specular);
      opacity: 0.35;
      border-radius: 50%;
      transform: translate(-50%, -50%) scale(0);
      animation: rippleExpand 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      pointer-events: none;
      z-index: 10;
    `;

    const btnPos = getComputedStyle(btn).position;
    if (btnPos === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';

    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 550);
  });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes rippleExpand {
      to {
        transform: translate(-50%, -50%) scale(70);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
})();

/* ─── 4. CARD 3D PERSPECTIVE TILT ─── */
(function initCardTilt() {
  document.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.kpi-card');
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const tiltX = -y * 1.5;
    const tiltY = x * 1.5;

    card.style.transform = `translateY(-1px) rotateX(${tiltX.toFixed(1)}deg) rotateY(${tiltY.toFixed(1)}deg)`;
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.kpi-card');
    if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
      card.style.transform = '';
    }
  });
})();

/* ─── 5. ACTIVE NAV INDICATOR (delegated to app.js router) ─── */


/* ─── 6. CHAT TYPING INDICATOR ─── */
(function initChatEnhance() {
  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'chat-form') {
      const chatMessages = document.getElementById('chat-messages');
      if (!chatMessages) return;

      setTimeout(() => {
        const existing = chatMessages.querySelector('.typing-indicator-wrap');
        if (!existing) {
          const wrap = document.createElement('div');
          wrap.className = 'chat-msg chat-msg--assistant typing-indicator-wrap';
          wrap.innerHTML = `
            <div class="typing-indicator">
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
            </div>
          `;
          chatMessages.appendChild(wrap);
          chatMessages.scrollTop = chatMessages.scrollHeight;

          setTimeout(() => wrap.remove(), 3000);
        }
      }, 100);
    }
  });
})();

/* ─── 7. MOBILE SIDEBAR RESPONSIVE TOGGLE ─── */
(function initMobileSidebar() {
  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('#mobile-sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (toggleBtn && sidebar) {
      sidebar.classList.toggle('sidebar--open');
      return;
    }

    if (sidebar && sidebar.classList.contains('sidebar--open')) {
      const clickedInside = e.target.closest('.sidebar');
      if (!clickedInside) {
        sidebar.classList.remove('sidebar--open');
      }
    }
  });

  // Close sidebar on navigation item click
  document.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar-nav .nav-item')) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && sidebar.classList.contains('sidebar--open')) {
        sidebar.classList.remove('sidebar--open');
      }
    }
  });
})();

console.log('🎨 Kaizen AI Premium UI v5.0 loaded — Minimalist Soft Morphism · Responsive');
