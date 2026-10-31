// 🎉 A short burst of confetti for logging a meal or a weigh-in (owner, 2026-10-31): a pat on the
// back for the habit. Bigger for a milestone (all of today's meals, a weigh-in streak). Nothing at
// all when the phone is set to reduce motion; it never blocks a tap and cleans up after itself.
const BITS = ['🎉', '✨', '💚', '⭐', '🎊'];
export const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export function confetti({ x = null, y = null, big = false } = {}) {
  if (typeof document === 'undefined' || calm()) return false;
  const cx = x ?? innerWidth / 2, cy = y ?? innerHeight * 0.4, n = big ? 30 : 16;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'), a = (i / n) * 6.283 + Math.random() * 0.3, r = (big ? 90 : 60) + Math.random() * (big ? 80 : 45);
    c.className = 'confetti'; c.setAttribute('aria-hidden', 'true');
    c.textContent = BITS[i % BITS.length];
    c.style.left = `${cx}px`; c.style.top = `${cy}px`;
    c.style.setProperty('--dx', `${Math.cos(a) * r}px`);
    c.style.setProperty('--dy', `${Math.sin(a) * r - 40}px`);
    c.style.setProperty('--rot', `${Math.round(Math.random() * 360 - 180)}deg`);
    document.body.append(c);
    setTimeout(() => c.remove(), 1200);
  }
  return true;
}
// Where a tapped element is, for the burst to start from.
export const fromEl = (el) => { const b = el?.getBoundingClientRect?.(); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : {}; };
