/* ==========================================================================
   L&D ENGENHARIA — motion & interaction
   Everything degrades: CSS owns the resting state, JS only adds classes and
   custom properties. Reduced-motion is honoured per-feature, not globally.
   ========================================================================== */

(() => {
  'use strict';

  /* Tells the head failsafe that the motion layer is alive, so it keeps the
     .js hidden states instead of reverting the page to .no-js. */
  document.documentElement.classList.add('anim');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse  = window.matchMedia('(pointer: coarse)');
  const fine    = () => !coarse.matches && !reduced.matches;

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* Safari 13 and older only have the deprecated form. */
  const onMedia = (mql, fn) => {
    if (mql.addEventListener) mql.addEventListener('change', fn);
    else mql.addListener(fn);
  };

  /* ----------------------------------------- one scroll loop, one resize loop
     Every scroll-driven and size-driven feature subscribes here rather than
     adding a listener of its own, so the page carries exactly one scroll
     handler, one resize handler and one animation frame no matter how many
     effects are running. */
  const scrollSubs = [];
  const resizeSubs = [];
  let scrollQueued = false;
  let resizeQueued = false;

  /* ---------------------------------------------- the two measurements
     Viewport height and scrollable distance are read from layout, so
     reading them AFTER a subscriber has written a style forces the browser
     to lay the page out again on the spot — every scroll frame, for as
     long as the page is being scrolled. They are read once here, at the
     top of the frame where layout is still clean from the last paint, and
     handed to the subscribers as plain numbers.

     `dirty` is set by anything that can change either one: the viewport
     resizing, and the document growing or shrinking (the equipe stage
     animating its height, a panel swapping, the menu pinning the body). */
  let viewH = window.innerHeight;
  let docMax = 0;
  let metricsDirty = true;

  /* Anything else that needs a rectangle measures HERE and nowhere else.
     The top of the frame is the one moment in the cycle where the tree is
     clean — nothing has been written since the last paint — so a read costs
     a lookup instead of a forced style recalc and layout. Effects then work
     off the numbers for the rest of the frame. */
  const measureSubs = [];
  const onMeasure = (fn) => { measureSubs.push(fn); };

  const readMetrics = () => {
    metricsDirty = false;
    viewH = window.innerHeight;
    docMax = document.documentElement.scrollHeight - viewH;
    for (let i = 0; i < measureSubs.length; i++) measureSubs[i]();
  };

  const flushScroll = () => {
    scrollQueued = false;
    if (metricsDirty) readMetrics();
    for (let i = 0; i < scrollSubs.length; i++) scrollSubs[i]();
  };
  const flushResize = () => {
    resizeQueued = false;
    metricsDirty = true;
    for (let i = 0; i < resizeSubs.length; i++) resizeSubs[i]();
  };

  const queueScroll = () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(flushScroll);
  };
  const queueResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(flushResize);
  };

  /* Subscribing no longer runs the handler on the spot: three separate
     first runs meant three separate layout reads while the script was
     still evaluating. They all run once together at the end of the file
     instead, which is the same starting state in one pass. */
  const onScroll = (fn) => { scrollSubs.push(fn); };
  const onResize = (fn) => { resizeSubs.push(fn); };

  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueResize, { passive: true });

  /* The document's height changes without the window ever resizing — the
     equipe stage animates its own, reveals settle, the menu pins the body.
     Marking the metrics stale is all this does; the next scroll frame
     re-reads them at a moment when reading is free. */
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { metricsDirty = true; }).observe(document.body);
  }
  /* iOS reports the pre-rotation metrics on orientationchange and does not
     always follow it with a resize, so measure once now and once after the
     new viewport has settled. */
  window.addEventListener('orientationchange', () => {
    queueResize();
    window.setTimeout(queueResize, 250);
  }, { passive: true });

  /* A webfont or an image that lands late moves everything below it without
     the window ever resizing, and a swap that grows one block while another
     settles can leave the body the same height the observer above saw. Both
     are one-off moments, so both simply mark the measurement stale; the next
     frame re-reads it where reading is free. */
  const restale = () => { metricsDirty = true; queueScroll(); };
  window.addEventListener('load', restale, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(restale);

  /* ============================================ 1 · SPLIT HEADINGS ==== */
  /* Wraps every word in an overflow-hidden shell so the line can rise from
     its own baseline. Inline elements (<em>) are walked into, not lost.   */
  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const words = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          words.forEach((word) => {
            if (!word) return;
            if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(' ')); return; }
            const shell = document.createElement('span');
            shell.className = 'w';
            shell.style.setProperty('--wi', i++);
            const inner = document.createElement('span');
            inner.className = 'w__i';
            inner.textContent = word;
            shell.appendChild(inner);
            frag.appendChild(shell);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };
    walk(el);
  }

  $$('[data-split]').forEach((el) => { splitWords(el); el.classList.add('is-split'); });

  /* Hero title lines carry their own index for the staged entrance. */
  $$('.hero__title .ln').forEach((ln, i) => ln.style.setProperty('--wi', i));

  /* ============================================ 2 · SCROLL REVEALS ==== */
  /* scrubbed text is driven by scroll position, not by the observer */
  const revealTargets = $$('[data-reveal], [data-split]')
    .filter((el) => !el.hasAttribute('data-scrub'));
  if ('IntersectionObserver' in window) {
    /* Every target is a one-shot, so the observer has a finite life: once
       the last one has revealed there is nothing left to watch and it can
       go rather than sit registered for the rest of the session. */
    let pending = revealTargets.length;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
        if (--pending === 0) io.disconnect();
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('is-in'));
  }

  /* ======================================== 2b · SCROLL-SCRUBBED TEXT ==
     The words are not triggered — their position IS the scroll position, so
     they rise on the way down and sink again on the way back up. */
  const scrubbed = $$('[data-scrub]').map((el) => {
    const words = $$('.w__i', el);
    /* what was last written to each word, so a word that has not actually
       moved this frame is not handed the same string again */
    /* `cur` is where the wave actually is, which lags where the scroll says
       it should be — see the damping below. -1 means "not yet placed". */
    return { el, words, sent: new Array(words.length), cur: -1, top: 0, live: false };
  });

  if (scrubbed.length) {
    if (reduced.matches) {
      scrubbed.forEach(({ words }) => words.forEach((w) => { w.style.transform = 'none'; }));
    } else {
      const OVERLAP = 6; /* how many words are mid-flight at any moment */

      /* Where the quote sits in the DOCUMENT, not in the viewport. The old
         loop asked the element for its rectangle on every scrolled frame,
         and the nav writes classes in the same pass — so that read landed on
         a tree the previous frame had already dirtied and forced a full
         style recalc plus layout before the frame could continue. Sixty
         forced layouts a second to move six words is the stutter. The offset
         does not change while the page is only being scrolled, so it is
         measured at the top of the frame and the rest is arithmetic on
         window.scrollY, which costs nothing. */
      const measureScrub = () => {
        const y = window.scrollY;
        for (let s = 0; s < scrubbed.length; s++) {
          const it = scrubbed[s];
          const r = it.el.getBoundingClientRect();
          it.top = r.top + y;
        }
      };
      onMeasure(measureScrub);

      /* A compositor layer per word is what keeps the rewrite off the paint
         path, but holding one per word for the life of the page is not free
         either. The hint goes on only while the quote is near the band it
         animates in and comes off on the way out, so the layers exist for
         the few seconds the words are actually moving. */
      if ('IntersectionObserver' in window) {
        const lo = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            const it = scrubbed.find((x) => x.el === entry.target);
            if (!it) return;
            it.live = entry.isIntersecting;
            entry.target.classList.toggle('is-scrubbing', entry.isIntersecting);
          });
          /* The observer is what wakes this effect up, and it fires a frame
             or two after load — which on a page restored mid-scroll is after
             the one pass every subscriber gets. Without this the quote would
             hold its pre-entrance offset until something else scrolled. */
          queueScroll();
        }, { rootMargin: '30% 0px 30% 0px' });
        scrubbed.forEach((it) => lo.observe(it.el));
      } else {
        scrubbed.forEach((it) => { it.live = true; it.el.classList.add('is-scrubbing'); });
      }

      /* ------------------------------------------------ the damping
         Tying the words directly to the scroll position looked right on
         paper and wrong in the hand. A wheel does not report a continuous
         position: one notch is a single jump of roughly a hundred pixels,
         so the wave did not glide across the sentence, it landed in about a
         dozen discrete shoves. That reads as stutter no matter how many
         frames a second the page is drawing — and it is why this still felt
         stuck after the paint cost was gone.

         So the scroll now sets a TARGET and the wave chases it, closing a
         fixed proportion of the remaining distance every frame. A notch of
         the wheel becomes a push the words glide out over the next few
         frames instead of a teleport. The proportion is derived from the
         real elapsed time rather than assumed per frame, so the glide takes
         the same fraction of a second at 60Hz, at 120Hz, and on a frame
         that arrived late.

         TAU is how long it takes to close about two thirds of the gap.
         Under roughly 70ms the shoves start showing through again; much
         over 140ms and the sentence lags visibly behind the scroll. */
      const TAU = 105;
      const SETTLED = 0.0004;  /* closer than this and the eye cannot tell */

      let raf = 0;
      let lastT = 0;

      /* Where the wave WANTS to be, straight off the scroll position. */
      const targetOf = (it, y) => {
        const top  = it.top - y;             /* viewport-relative, no layout read */
        const from = viewH * 0.92;
        const to   = viewH * 0.30;
        const p = (from - top) / (from - to);
        return p < 0 ? 0 : p > 1 ? 1 : p;
      };

      const paint = (it) => {
        const words = it.words, sent = it.sent, p = it.cur;
        const span = words.length + OVERLAP;
        for (let i = 0; i < words.length; i++) {
          let wp = (p * span - i) / OVERLAP;
          wp = wp < 0 ? 0 : wp > 1 ? 1 : wp;
          /* Each word also carries its own ease. A linear ramp meant every
             word travelled at one flat speed and stopped dead on arrival;
             the cubic lets it come up quickly and settle into the line,
             which is what makes the wave read as one motion rather than
             twenty little slides. */
          const e = 1 - (1 - wp) * (1 - wp) * (1 - wp);
          /* Only a handful of words are in flight at a time; the ones
             already home and the ones still waiting resolve to the
             identical transform frame after frame. Writing it again would
             invalidate their style for nothing. */
          const t = `translate3d(0, ${((1 - e) * 118).toFixed(2)}%, 0)`;
          if (sent[i] === t) continue;
          sent[i] = t;
          words[i].style.transform = t;
        }
      };

      const tick = (now) => {
        raf = 0;
        /* A frame that arrived late must not be allowed to close the whole
           gap at once — that is the teleport this exists to remove. */
        const dt = lastT ? Math.min(now - lastT, 50) : 16.7;
        lastT = now;
        const k = 1 - Math.exp(-dt / TAU);

        const y = window.scrollY;
        let moving = false;

        for (let s = 0; s < scrubbed.length; s++) {
          const it = scrubbed[s];
          if (!it.live) continue;
          const target = targetOf(it, y);

          /* First sight: start ON the target rather than gliding in from
             wherever the last visit left the wave — and draw it, because
             the settle test below would otherwise read "already there" and
             leave the words sitting on the resting offset CSS gave them. */
          if (it.cur < 0) { it.cur = target; paint(it); continue; }

          const d = target - it.cur;
          if (d > -SETTLED && d < SETTLED) {
            if (it.cur === target) continue;   /* already there, nothing to draw */
            it.cur = target;
          } else {
            it.cur += d * k;
            moving = true;
          }
          paint(it);
        }

        /* The loop only lives while something is actually in motion: it
           starts on a scroll, coasts for the few frames the wave needs to
           catch up, and then stops until the next one. */
        if (moving) raf = requestAnimationFrame(tick);
        else lastT = 0;
      };

      const wake = () => {
        if (raf) return;
        lastT = 0;
        raf = requestAnimationFrame(tick);
      };
      onScroll(wake);
    }
  }

  /* ============================================ 3 · HERO SEQUENCE ==== */
  /* Held until the display face is ready, so the masked lines never rise
     in a fallback font and reflow mid-flight. */
  const hero = $('#hero');
  if (hero) {
    const start = () => requestAnimationFrame(() => hero.classList.add('is-ready'));
    if (document.fonts && document.fonts.ready) {
      let fired = false;
      const once = () => { if (!fired) { fired = true; start(); } };
      document.fonts.ready.then(once);
      setTimeout(once, 1200);
    } else {
      start();
    }
  }

  /* ================================================== 4 · COUNTERS ==== */
  const animateCount = (el, target) => {
    if (reduced.matches) { el.textContent = target; return; }
    const dur = 1600;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    let left = counters.length;
    const co = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target, parseInt(entry.target.dataset.count, 10));
        co.unobserve(entry.target);
        if (--left === 0) co.disconnect();
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => co.observe(el));
  } else {
    counters.forEach((el) => { el.textContent = el.dataset.count; });
  }

  /* ======================================================= 5 · NAV ==== */
  const nav      = $('#nav');
  const progress = $('#scroll-progress');
  const progressFill = $('#scroll-progress-fill');
  let lastY = window.scrollY;
  let lastP = '';

  onScroll(() => {
    const y = window.scrollY;

    nav.classList.toggle('is-stuck', y > 24);

    /* scroll progress across the whole document — off the cached metrics,
       so the bar never costs a layout of its own */
    if (progressFill) {
      const p = docMax > 0 ? (y / docMax).toFixed(4) : '0';
      if (p !== lastP) { lastP = p; progressFill.style.setProperty('--p', p); }
    }

    /* give the page back to the reader on the way down */
    if (!document.body.classList.contains('menu-open')) {
      const hide = y > lastY && y > 420;
      nav.classList.toggle('is-hidden', hide);
      /* the bar rides under the nav, and only pins to the top once the nav
         has actually gone */
      if (progress) progress.classList.toggle('is-top', hide);
    }
    lastY = y;
  });

  /* Active section link. The root is squeezed to a band across the middle of
     the viewport and the threshold left at zero, so the marker follows
     whichever section is under that line. A visible-area ratio cannot do
     this job: a section taller than the viewport never reaches one, which
     is every section on a phone held sideways. */
  const navLinks = $$('.nav__link:not(.nav__link--cta)');
  const sections = $$('section[id]');
  if (sections.length && 'IntersectionObserver' in window) {
    const so = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        navLinks.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === `#${id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach((s) => so.observe(s));
  }

  /* ============================================== 6 · MOBILE MENU ==== */
  const burger = $('#hamburger');
  const menu   = $('#mobile-menu');
  let menuOpen = false;

  /* `overflow: hidden` on the body does not hold on iOS Safari — the page
     behind the menu still rubber-bands. Pinning the body does hold, but it
     drops the scroll position, so the offset is carried across by hand. */
  let lockedY = 0;
  const lockScroll = (on) => {
    const locked = document.body.classList.contains('is-locked');
    if (on === locked) return;
    if (on) {
      lockedY = window.scrollY;
      document.body.style.top = `-${lockedY}px`;
      document.body.classList.add('is-locked');
    } else {
      document.body.classList.remove('is-locked');
      document.body.style.top = '';
      window.scrollTo({ top: lockedY, left: 0, behavior: 'instant' });
      /* resync the nav's direction memory, or the restore reads as a
         downward scroll and retracts the bar */
      lastY = lockedY;
    }
  };

  const setMenu = (open) => {
    menuOpen = open;
    menu.classList.toggle('is-open', open);
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.classList.toggle('menu-open', open);
    lockScroll(open);
    if (open) {
      nav.classList.remove('is-hidden');
      if (progress) progress.classList.remove('is-top');
    }
  };

  if (burger && menu) {
    burger.addEventListener('click', () => setMenu(!menuOpen));
    /* one listener on the panel instead of one per row — and still on an
       ancestor closer than the document, so it runs before the anchor
       handler below, exactly as five separate listeners did */
    menu.addEventListener('click', (e) => {
      if (e.target.closest('.mobile-link')) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); }
    });
    /* rotating to landscape can widen past the breakpoint that shows the
       hamburger at all — close rather than leave an unreachable overlay */
    const wide = window.matchMedia('(min-width: 821px)');
    onMedia(wide, () => { if (wide.matches && menuOpen) setMenu(false); });
  }

  /* ========================================= 7 · ANCHOR SCROLLING ==== */
  /* Delegated: the page carries seventeen in-page anchors — nav, menu,
     hero buttons, six service links, two footer lists — and they all want
     the same handler. One listener on the document does the work of
     seventeen, and picks up any anchor added later for free. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const navH = nav ? nav.offsetHeight : 0;
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - navH - 8,
      behavior: reduced.matches ? 'auto' : 'smooth'
    });
    history.replaceState(null, '', id);
  });

  /* ============================================== 8 · EQUIPE TABS ==== */
  const tabs   = $$('.equipe__tab');
  const panels = $$('.equipe__panel');
  const stage  = $('#equipe-stage');
  const thumb  = $('.equipe__thumb');
  const tabBar = $('.equipe__tabs');

  const moveThumb = (tab) => {
    if (!thumb || !tabBar || !tab) return;
    const bar = tabBar.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    /* width is CSS's job — the columns are equal, so only the offset moves */
    thumb.style.transform = `translateX(${box.left - bar.left - tabBar.clientLeft}px)`;
  };

  if (tabs.length && stage) {
    const activeTab = () => tabs.find((t) => t.classList.contains('is-active'));

    /* The swap leaves a timer behind that puts the stage back on automatic
       height 560ms later. A second switch inside that window used to let
       the first timer land in the middle of the second transition and wipe
       the height it was animating to — the stage would snap. Settling the
       pending swap before starting a new one keeps the two apart, and
       drops the stale timeouts instead of letting them stack. */
    let swapTimer = 0;
    let staggerTimers = [];

    const settle = () => {
      if (swapTimer) { clearTimeout(swapTimer); swapTimer = 0; }
      staggerTimers.forEach(clearTimeout);
      staggerTimers = [];
      panels.forEach((p) => {
        if (!p.classList.contains('is-leaving')) return;
        p.classList.remove('is-leaving');
        p.hidden = true;
      });
      stage.style.height = '';
    };

    const switchTo = (name) => {
      const next = panels.find((p) => p.dataset.panel === name);
      const cur  = panels.find((p) => p.classList.contains('is-active'));
      if (!next || next === cur) return;
      settle();

      tabs.forEach((t) => {
        const on = t.dataset.tab === name;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      moveThumb(tabs.find((t) => t.dataset.tab === name));

      if (reduced.matches) {
        cur.classList.remove('is-active');
        cur.hidden = true;
        next.hidden = false;
        next.classList.add('is-active');
      } else {
        /* lock the height we are leaving, then animate to the new one.
           Reading offsetHeight forces the reflow that commits the entering
           panel's start state, so the transition runs without waiting on a
           frame callback — which a background tab would never deliver. */
        stage.style.height = `${stage.offsetHeight}px`;
        cur.classList.remove('is-active');
        cur.classList.add('is-leaving');
        next.hidden = false;
        next.classList.add('is-entering');
        const h = next.offsetHeight;

        stage.style.height = `${h}px`;
        next.classList.remove('is-entering');
        next.classList.add('is-active');

        swapTimer = window.setTimeout(() => {
          swapTimer = 0;
          cur.classList.remove('is-leaving');
          cur.hidden = true;
          stage.style.height = '';
        }, 560);
      }

      /* anything waiting to reveal inside the new panel arrives with it */
      $$('[data-reveal]:not(.is-in), [data-split]:not(.is-in)', next)
        .forEach((el, i) => staggerTimers.push(
          window.setTimeout(() => el.classList.add('is-in'), i * 45)));
    };

    tabs.forEach((tab) => tab.addEventListener('click', () => switchTo(tab.dataset.tab)));

    /* roving arrow keys across the tablist */
    tabBar.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let n = null;
      if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft')  n = (i - 1 + tabs.length) % tabs.length;
      if (n === null) return;
      e.preventDefault();
      tabs[n].focus();
      switchTo(tabs[n].dataset.tab);
    });

    const placeThumb = () => moveThumb(activeTab());
    placeThumb();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeThumb);
    onResize(placeThumb);
  }

  /* ================================================= 9 · POINTER ==== */
  /* Tilt writes CSS custom properties; the stylesheet owns the transform,
     so hover scale and pointer tilt compose instead of overwriting.      */
  /* `hit` listens and is never transformed; `target` does the moving. If the
     listener tilted itself it would slide its own edge off the cursor, fire
     pointerleave, snap back, and re-enter — the flicker at the card edges. */
  const clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

  /* Each binding hands back its own teardown, so switching input device or
     turning reduced motion on unbinds cleanly instead of stacking a second
     set of listeners on the same elements. */
  const tiltTeardowns = [];

  const bindTilt = (hit, target, amount) => {
    if (!hit || !target) return;
    let raf = null, px = 0, py = 0;
    const enter = () => target.classList.add('is-tracking');
    /* The box was measured on every pointermove — and a mouse reports far
       more often than the screen refreshes, up to 1000Hz on a gaming
       mouse, so a single pass across a card forced dozens of layouts to
       produce one frame. The event now only records where the cursor is;
       the measurement happens inside the frame that is going to use it,
       at most once per frame, at the point where layout is still clean. */
    const move = (e) => {
      px = e.clientX; py = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const r = hit.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const rx = clamp(((px - r.left) / r.width  - 0.5) * 2) * amount;
        const ry = clamp(((py - r.top)  / r.height - 0.5) * 2) * amount;
        target.style.setProperty('--rx', rx.toFixed(2));
        target.style.setProperty('--ry', ry.toFixed(2));
      });
    };
    const leave = () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      target.classList.remove('is-tracking');
      target.style.setProperty('--rx', 0);
      target.style.setProperty('--ry', 0);
    };
    hit.addEventListener('pointerenter', enter);
    hit.addEventListener('pointermove', move, { passive: true });
    hit.addEventListener('pointerleave', leave);
    tiltTeardowns.push(() => {
      hit.removeEventListener('pointerenter', enter);
      hit.removeEventListener('pointermove', move);
      hit.removeEventListener('pointerleave', leave);
      leave();
    });
  };

  const syncTilt = () => {
    while (tiltTeardowns.length) tiltTeardowns.pop()();
    if (!fine()) return;
    const heroLogo = $('#hero-logo');
    if (heroLogo) bindTilt(heroLogo, $('.hero__logo-3d', heroLogo), 18);
    $$('[data-tilt]').forEach((el) => bindTilt(el, $('.projeto-card__inner', el), 4));
  };
  syncTilt();
  onMedia(coarse, syncTilt);
  onMedia(reduced, syncTilt);

  /* The ghost word drifts against the scroll. What is written here is only
     the DISTANCE — the transform that carries it belongs to the stylesheet,
     because the two layouts hold the word differently: laid flat across the
     middle on a wide screen, stood on its end in the left margin on a
     narrow one. Writing a finished transform from here meant this line
     silently decided which of the two won, and the narrow one always lost.
     The observer keeps it idle while the hero is off-screen. */
  const bgText = $('.hero__bg-text');
  if (bgText && hero) {
    let visible = true;
    /* `is-drifting` is what holds the compositor layer (see the stylesheet).
       It goes on with the writes and comes off with them, so the word keeps
       a texture for the one screen where it moves rather than for the whole
       document under it. */
    bgText.classList.add('is-drifting');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        bgText.classList.toggle('is-drifting', visible);
      }, { threshold: 0 }).observe(hero);
    }
    let drifting = false;
    let sent = '';
    onScroll(() => {
      if (reduced.matches) {
        if (drifting) { bgText.style.removeProperty('--drift'); drifting = false; sent = ''; }
        return;
      }
      if (!visible) return;
      drifting = true;
      const t = `${(window.scrollY * 0.22).toFixed(1)}px`;
      if (t === sent) return;
      sent = t;
      bgText.style.setProperty('--drift', t);
    });
  }

  /* ------------------------------------------- loops that left the screen
     The marquee and the logo's float are compositor animations, so they are
     cheap to paint — but a paused animation is not ticked at all, and the
     layer behind it can be released. Neither carries state: they are
     continuous loops, so they resume on the phase the reader left them on,
     which is the phase they would have been looking at anyway. Both are
     already `animation: none` under reduced motion; this does not reach
     them there. */
  const pauseOffscreen = (el) => {
    if (!el || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(([e]) => {
      el.classList.toggle('is-paused', !e.isIntersecting);
    }, { rootMargin: '10% 0px' }).observe(el);
  };
  pauseOffscreen($('.marquee__inner'));
  pauseOffscreen($('.hero__logo-float'));

  /* ==================================================== 10 · FORM ==== */
  const form   = $('#contact-form');
  const status = $('#form-status');
  const submit = $('#submit-btn');

  const say = (msg, isError) => {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('is-error', !!isError);
    status.classList.add('is-shown');
  };

  if (form && submit) {
    const label = $('.btn__label', submit);
    const idle  = label ? label.textContent : '';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;

      submit.classList.add('is-sending');
      submit.disabled = true;
      if (status) status.classList.remove('is-shown');

      const body = new URLSearchParams(new FormData(form)).toString();

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          form.reset();
          if (label) label.textContent = 'Mensagem enviada';
          submit.classList.add('is-sent');
          say('Recebemos sua mensagem. Retornamos em até 3 dias úteis.', false);
          window.setTimeout(() => {
            if (label) label.textContent = idle;
            submit.classList.remove('is-sent');
            if (status) status.classList.remove('is-shown');
          }, 6000);
        })
        .catch((err) => {
          console.error('Falha ao enviar o formulário:', err);
          say('Não foi possível enviar agora. Escreva para led.eng.024@gmail.com.', true);
        })
        .finally(() => {
          submit.classList.remove('is-sending');
          submit.disabled = false;
        });
    });
  }

  /* =============================================== 11 · SIGNATURE ====
     The credit writes itself, and js/assinatura.js owns all of that -- its
     own pen data, its own timing, its own canvas. The one thing that belongs
     here is what changes about being in a footer instead of a hero: in the
     hero the writing is the first thing on screen and cannot be missed. Down
     here you can scroll past during the 2.4s and arrive to a signature that
     is simply already written.

     So a pointer replays it. Only where there is a pointer to replay it with,
     and never under reduced motion -- `fine()` is already both of those.

     The engine is also no longer part of the page's arrival. It is 70 KB,
     nearly all of it the recorded pen path, and it used to be fetched,
     parsed and evaluated on every visit while the hero was still coming
     in -- for a canvas that sits at the very bottom of the document, which
     most readers reach seconds later and many never reach at all. It is
     fetched when the footer comes within a viewport and a half instead,
     which is far enough ahead that it has always arrived before the
     engine's own observer decides to start writing. Nothing about the
     writing itself changed: the same file, the same 2.4s, the same
     trigger. */
  const assinatura = $('.assinatura');
  if (assinatura) {
    let asked = false;
    const loadEngine = () => {
      if (asked) return;
      asked = true;
      const s = document.createElement('script');
      s.src = 'js/assinatura.js';
      s.async = true;
      document.body.appendChild(s);
    };

    if ('IntersectionObserver' in window) {
      const ao = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        ao.disconnect();
        loadEngine();
      }, { rootMargin: '150% 0px' });
      ao.observe(assinatura);
    } else {
      window.addEventListener('load', loadEngine, { once: true });
    }

    if (fine()) {
      assinatura.addEventListener('pointerenter', () => {
        loadEngine();
        const engine = window.__assinatura;
        if (engine && engine.play) engine.play();
      });
    }
  }

  /* Every subscriber's first run, once, now that they are all registered. */
  flushScroll();

  console.log('%cL&D Engenharia', 'font:700 20px Syne,sans-serif;color:#581328');
  console.log('%cEmpresa Júnior · UNESP São João da Boa Vista', 'color:#7a5c64');
})();
