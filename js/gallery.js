/* ── Gallery swipe (touch) ── */
let gTouch = null;
const productGridEl = document.getElementById('productGrid');

productGridEl.addEventListener('touchstart', e => {
  const gallery = e.target.closest('.gallery');
  if (!gallery || +gallery.dataset.count <= 1) return;
  const t = e.touches[0];
  gTouch = {
    gallery,
    track: gallery.querySelector('.gallery-track'),
    startX: t.clientX,
    startY: t.clientY,
    deltaX: 0,
    width: gallery.getBoundingClientRect().width,
    active: +gallery.dataset.active || 0,
    axis: null,
  };
}, { passive: true });

productGridEl.addEventListener('touchmove', e => {
  if (!gTouch) return;
  const t = e.touches[0];
  const dx = t.clientX - gTouch.startX;
  const dy = t.clientY - gTouch.startY;

  if (gTouch.axis === null) {
    gTouch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if (gTouch.axis === 'y') return; // let page scroll vertically

  e.preventDefault();
  gTouch.deltaX = dx;
  gTouch.track.style.transition = 'none';
  const basePct = -gTouch.active * 100;
  const dragPct = (dx / gTouch.width) * 100;
  gTouch.track.style.transform = `translateX(calc(${basePct}% + ${dragPct}%))`;
}, { passive: false });

productGridEl.addEventListener('touchend', () => {
  if (!gTouch) return;
  const { gallery, deltaX, width, active } = gTouch;
  const threshold = width * 0.15;
  let next = active;
  if (Math.abs(deltaX) > threshold) {
    next = active + (deltaX < 0 ? 1 : -1);
  }
  setActiveSlide(gallery, next);
  gTouch = null;
});

productGridEl.addEventListener('touchcancel', () => { gTouch = null; });

function setActiveSlide(galleryEl, newIndex, animate = true) {
  const count = +galleryEl.dataset.count || 1;
  if (count <= 1) return;
  const active = ((newIndex % count) + count) % count; // infinite loop wrap
  galleryEl.dataset.active = active;

  const track = galleryEl.querySelector('.gallery-track');
  track.style.transition = animate ? 'transform 0.3s ease' : 'none';
  track.style.transform = `translateX(-${active * 100}%)`;

  galleryEl.querySelectorAll('.gallery-dot').forEach((d, i) => d.classList.toggle('active', i === active));
  const counter = galleryEl.querySelector('.gallery-counter');
  if (counter) counter.textContent = `${active + 1} / ${count}`;
}
