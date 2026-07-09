/**
 * ValetSync | UI Motion Engine
 * Scroll progress, header shrink, aurora parallax, scroll-reveal,
 * cursor-tracking card glow, and animated count-ups.
 */
(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Scroll progress bar + header shrink + aurora parallax ---
    const bar = document.getElementById('scroll-progress-bar');
    const header = document.getElementById('app-header');
    const blobs = document.querySelectorAll('.aurora .blob');
    let ticking = false;

    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const y = window.scrollY;
            if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
            if (header) header.classList.toggle('is-scrolled', y > 24);
            if (!reduced) {
                // Each layer drifts at a different rate for depth
                blobs.forEach((b, i) => {
                    b.style.translate = `0 ${y * (0.05 + i * 0.045)}px`;
                });
            }
            ticking = false;
        });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();

    // --- Reveal-on-scroll (IntersectionObserver) ---
    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    /**
     * Observe all un-revealed .reveal elements inside root.
     * Elements already inside the viewport get a stagger delay
     * so they cascade instead of popping in at once.
     */
    const observeReveals = (root = document) => {
        const els = root.querySelectorAll('.reveal:not(.in-view)');
        let batch = 0;
        els.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight) {
                el.style.setProperty('--reveal-delay', `${Math.min(batch, 8) * 75}ms`);
                batch++;
            } else {
                el.style.setProperty('--reveal-delay', '0ms');
            }
            io.observe(el);
        });
    };

    // --- Cursor-tracking glow on event cards (delegated) ---
    if (!reduced) {
        document.addEventListener('pointermove', (e) => {
            const card = e.target.closest ? e.target.closest('.event-card') : null;
            if (!card) return;
            const r = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
            card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
        }, { passive: true });
    }

    // --- Animated count-up for stat numbers ---
    const countUp = (el, target, duration = 1100) => {
        target = parseInt(target) || 0;
        if (reduced) { el.innerText = target; return; }
        const start = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 4); // ease-out-quart
            el.innerText = Math.round(target * eased);
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    window.ValetFX = { observeReveals, countUp };
    document.addEventListener('DOMContentLoaded', () => observeReveals());
})();
