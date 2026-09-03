(() => {
    const track   = document.getElementById('ss-track');
    if (!track) return;
    const cards   = [...track.querySelectorAll('.ss-card')];
    const dots    = [...document.querySelectorAll('.ss-pager__dot')];
    const btnPrev = document.getElementById('ss-btn-prev');
    const btnNext = document.getElementById('ss-btn-next');

    /* where does each card centre the scroller? (the browser's own
       math, redone so the pager can name the card)                 */
    function targets() {
        const w = track.clientWidth;
        const max = track.scrollWidth - w;
        return cards.map(card =>
            Math.max(0, Math.min(card.offsetLeft + card.offsetWidth / 2 - w / 2, max)));
    }
    function nearestIndex(sl) {
        const ts = targets();
        let best = 0;
        ts.forEach((t, i) => { if (Math.abs(t - sl) < Math.abs(ts[best] - sl)) best = i; });
        return best;
    }

    /* ── settle / pager / arrows ──────────────────────── */
    function setDots(idx) {
        dots.forEach((d, i) => {
            d.classList.toggle('is-active', i === idx);
            if (i === idx) d.setAttribute('aria-current', 'true');
            else d.removeAttribute('aria-current');
        });
        btnPrev.disabled = idx === 0;
        btnNext.disabled = idx === cards.length - 1;
    }

    /* skeleton → content: each card resolves once, the first
       time the browser lands it on a snap point               */
    const loadTimers = new Map();
    function scheduleLoad(card, delay) {
        if (card.classList.contains('is-loaded') || loadTimers.has(card)) return;
        loadTimers.set(card, setTimeout(() => {
            loadTimers.delete(card);
            card.classList.add('is-loaded');
        }, delay));
    }
    function cancelPendingLoads() {
        loadTimers.forEach(t => clearTimeout(t));
        loadTimers.clear();
    }

    function settle() {
        const sl = track.scrollLeft;
        const idx = nearestIndex(sl);
        const onPoint = Math.abs(targets()[idx] - sl) <= 2;
        cards.forEach((c, i) => c.classList.toggle('is-snapped', onPoint && i === idx));
        if (onPoint) scheduleLoad(cards[idx], 300);
        setDots(idx);
    }

    let settleTimer = null;
    track.addEventListener('scroll', () => {
        cancelPendingLoads();
        cards.forEach(c => c.classList.remove('is-snapped'));
        setDots(nearestIndex(track.scrollLeft));
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 160);   // fallback for no scrollend
    });
    track.addEventListener('scrollend', () => { clearTimeout(settleTimer); settle(); });

    /* ── prev / next ──────────────────────────────────── */
    const ease = t => 1 - Math.pow(1 - t, 5);          /* out-quint */
    function snapTarget(idx) {
        const ts = targets();
        return ts[Math.max(0, Math.min(idx, ts.length - 1))];
    }
    let glideId = null;
    function cancelGlide() {
        if (glideId === null) return;
        cancelAnimationFrame(glideId);
        glideId = null;
        track.classList.remove('is-gliding');
    }
    /* glide the scroller onto the card's own snap point; snap is
       paused while the tween drives (like a drag) and restored the
       moment we land exactly on it — so no correction jump        */
    function glideTo(left) {
        cancelGlide();
        const from = track.scrollLeft, delta = left - from;
        if (Math.abs(delta) < 0.5) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            track.classList.add('is-gliding');
            track.scrollLeft = left;
            track.classList.remove('is-gliding');
            settle();
            return;
        }
        track.classList.add('is-gliding');
        const t0 = performance.now(), dur = 600;
        const step = now => {
            const t = Math.min(1, (now - t0) / dur);
            track.scrollLeft = from + delta * ease(t);
            if (t < 1) { glideId = requestAnimationFrame(step); }
            else {
                glideId = null;
                track.classList.remove('is-gliding');
                track.scrollLeft = left;
                settle();
            }
        };
        glideId = requestAnimationFrame(step);
    }
    btnPrev.addEventListener('click', () => glideTo(snapTarget(nearestIndex(track.scrollLeft) - 1)));
    btnNext.addEventListener('click', () => glideTo(snapTarget(nearestIndex(track.scrollLeft) + 1)));

    /* pager dots — same glide path as the arrows */
    dots.forEach((dot, i) => dot.addEventListener('click', () => glideTo(snapTarget(i))));

    /* keyboard — the SAME glide path as arrows and dots. Page-
       level so a cold load responds to arrow keys immediately.
       The tutorial page guarded this with a BLOCKLIST of controls
       that own their arrow keys (code tabs, toolbar, theme switch)
       — never an allowlist, which broke the moment an arrow button
       or dot took focus. The standalone has no such controls left,
       so no guard remains: the keys work wherever focus sits.
       The preventDefault stops native arrow-scroll fighting the
       tween; modifiers pass through to browser/OS shortcuts.     */
    document.addEventListener('keydown', e => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        if (e.repeat && glideId !== null) return;   /* a held key never stacks tweens */
        const idx = nearestIndex(track.scrollLeft);
        if (e.key === 'ArrowRight')     { keyPress(btnNext); glideTo(snapTarget(idx + 1)); }
        else if (e.key === 'ArrowLeft') { keyPress(btnPrev); glideTo(snapTarget(idx - 1)); }
        else if (e.key === 'Home')      { keyPress(btnPrev); glideTo(snapTarget(0)); }
        else                            { keyPress(btnNext); glideTo(snapTarget(cards.length - 1)); }
    });

    /* the matching arrow answers the keystroke with its own press */
    let keyTimer = null;
    function keyPress(btn) {
        if (!btn || btn.disabled) return;
        clearTimeout(keyTimer);
        document.querySelectorAll('.ss-nav-btn.is-key').forEach(n => n.classList.remove('is-key'));
        btn.classList.add('is-key');
        keyTimer = setTimeout(() => btn.classList.remove('is-key'), 190);
    }

    /* ── drag the track (snap released with the pointer) ── */
    let dragging = false, dragMoved = false, startX = 0, startSL = 0, dragScale = 1;
    track.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        cancelGlide();
        dragging = true; dragMoved = false;
        startX = e.clientX;
        startSL = track.scrollLeft;
        dragScale = track.getBoundingClientRect().width / track.clientWidth || 1;
        track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = (e.clientX - startX) / dragScale;
        if (!dragMoved && Math.abs(dx) > 4) {
            dragMoved = true;
            track.classList.add('is-dragging');   // snap off while the pointer holds
        }
        if (dragMoved) track.scrollLeft = startSL - dx;
    });
    function endDrag() {
        if (!dragging) return;
        dragging = false;
        if (dragMoved) {
            track.classList.remove('is-dragging'); // snap comes back — browser re-snaps
            dragMoved = false;
        }
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    /* ── keep geometry honest — the component is fluid now ── */
    new ResizeObserver(() => { settle(); }).observe(track);

    /* ── boot ─────────────────────────────────────────── */
    settle();
})();
