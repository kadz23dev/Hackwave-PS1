/**
 * DYNAMIC MORPHISM INTERACTIVE ENGINE
 * Real-time specular highlight tracking, 3D card tilt & ambient physics
 */

document.addEventListener('DOMContentLoaded', () => {
  initCardSpecularLight();
  init3DTilt();
  initFloatingOrbs();
});

// Real-time specular light angle tracking
function initCardSpecularLight() {
  const cards = document.querySelectorAll('.morphism-card, .specular-surface');
  
  window.addEventListener('mousemove', (e) => {
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

// Subtle 3D Card Tilt on Hover
function init3DTilt() {
  const tiltElements = document.querySelectorAll('[data-tilt]');
  
  tiltElements.forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const deltaX = (x - centerX) / centerX;
      const deltaY = (y - centerY) / centerY;
      
      const maxTilt = parseFloat(el.getAttribute('data-tilt-max')) || 7;
      const rotateX = -deltaY * maxTilt;
      const rotateY = deltaX * maxTilt;
      
      el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    });
    
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });
}

// Ambient orbs subtle cursor inertia
function initFloatingOrbs() {
  const orbs = document.querySelectorAll('.ambient-orb');
  if (!orbs.length) return;
  
  let mouseX = 0, mouseY = 0;
  let targetX = 0, targetY = 0;
  
  window.addEventListener('mousemove', (e) => {
    targetX = (e.clientX - window.innerWidth / 2) * 0.04;
    targetY = (e.clientY - window.innerHeight / 2) * 0.04;
  });
  
  function updateOrbs() {
    mouseX += (targetX - mouseX) * 0.05;
    mouseY += (targetY - mouseY) * 0.05;
    
    orbs.forEach((orb, index) => {
      const factor = (index + 1) * 0.6;
      orb.style.transform = `translate(${mouseX * factor}px, ${mouseY * factor}px)`;
    });
    
    requestAnimationFrame(updateOrbs);
  }
  
  updateOrbs();
}

// Toast notification for user interactions
window.showMorphismToast = function(title, message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.position = 'fixed';
    toastContainer.style.bottom = '24px';
    toastContainer.style.right = '24px';
    toastContainer.style.zIndex = '9999';
    toastContainer.style.display = 'flex';
    toastContainer.style.flexDirection = 'column';
    toastContainer.style.gap = '10px';
    document.body.appendChild(toastContainer);
  }
  
  const toast = document.createElement('div');
  toast.className = 'morphism-card';
  toast.style.padding = '14px 20px';
  toast.style.borderRadius = '12px';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '12px';
  toast.style.minWidth = '280px';
  toast.style.maxWidth = '400px';
  toast.style.boxShadow = '0 15px 35px rgba(0,0,0,0.6)';
  toast.style.animation = 'sealPop 0.3s ease';
  
  let icon = '✨';
  let borderCol = 'var(--accent-primary)';
  if (type === 'success') { icon = '✅'; borderCol = '#10b981'; }
  if (type === 'error') { icon = '🚨'; borderCol = '#ef4444'; }
  if (type === 'warning') { icon = '⚠️'; borderCol = '#f59e0b'; }
  
  toast.style.borderLeft = `4px solid ${borderCol}`;
  
  toast.innerHTML = `
    <div style="font-size: 1.2rem;">${icon}</div>
    <div>
      <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-highlight);">${title}</div>
      <div style="font-size: 0.78rem; color: var(--text-secondary);">${message}</div>
    </div>
  `;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};
