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

  const flushScroll = () => { scrollQueued = false; scrollSubs.forEach((fn) => fn()); };
  const flushResize = () => { resizeQueued = false; resizeSubs.forEach((fn) => fn()); };

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

  const onScroll = (fn) => { scrollSubs.push(fn); fn(); };
  const onResize = (fn) => { resizeSubs.push(fn); };

  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueResize, { passive: true });
  /* iOS reports the pre-rotation metrics on orientationchange and does not
     always follow it with a resize, so measure once now and once after the
     new viewport has settled. */
  window.addEventListener('orientationchange', () => {
    queueResize();
    window.setTimeout(queueResize, 250);
  }, { passive: true });

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
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('is-in'));
  }

  /* ======================================== 2b · SCROLL-SCRUBBED TEXT ==
     The words are not triggered — their position IS the scroll position, so
     they rise on the way down and sink again on the way back up. */
  const scrubbed = $$('[data-scrub]').map((el) => ({ el, words: $$('.w__i', el) }));

  if (scrubbed.length) {
    if (reduced.matches) {
      scrubbed.forEach(({ words }) => words.forEach((w) => { w.style.transform = 'none'; }));
    } else {
      const OVERLAP = 6; /* how many words are mid-flight at any moment */
      onScroll(() => {
        const vh = window.innerHeight;
        scrubbed.forEach(({ el, words }) => {
          const r = el.getBoundingClientRect();
          if (r.bottom < -240 || r.top > vh + 240) return;
          const from = vh * 0.92;
          const to   = vh * 0.30;
          let p = (from - r.top) / (from - to);
          p = p < 0 ? 0 : p > 1 ? 1 : p;
          const span = words.length + OVERLAP;
          words.forEach((w, i) => {
            let wp = (p * span - i) / OVERLAP;
            wp = wp < 0 ? 0 : wp > 1 ? 1 : wp;
            w.style.transform = `translate3d(0, ${((1 - wp) * 118).toFixed(2)}%, 0)`;
          });
        });
      });
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
    const co = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target, parseInt(entry.target.dataset.count, 10));
        co.unobserve(entry.target);
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

  onScroll(() => {
    const y = window.scrollY;

    nav.classList.toggle('is-stuck', y > 24);

    /* scroll progress across the whole document */
    if (progressFill) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progressFill.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
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
    $$('.mobile-link', menu).forEach((l) => l.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); }
    });
    /* rotating to landscape can widen past the breakpoint that shows the
       hamburger at all — close rather than leave an unreachable overlay */
    const wide = window.matchMedia('(min-width: 821px)');
    onMedia(wide, () => { if (wide.matches && menuOpen) setMenu(false); });
  }

  /* ========================================= 7 · ANCHOR SCROLLING ==== */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
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

    const switchTo = (name) => {
      const next = panels.find((p) => p.dataset.panel === name);
      const cur  = panels.find((p) => p.classList.contains('is-active'));
      if (!next || next === cur) return;

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

        window.setTimeout(() => {
          cur.classList.remove('is-leaving');
          cur.hidden = true;
          stage.style.height = '';
        }, 560);
      }

      /* anything waiting to reveal inside the new panel arrives with it */
      $$('[data-reveal]:not(.is-in), [data-split]:not(.is-in)', next)
        .forEach((el, i) => window.setTimeout(() => el.classList.add('is-in'), i * 45));
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
    let raf = null, rx = 0, ry = 0;
    const enter = () => target.classList.add('is-tracking');
    const move = (e) => {
      const r = hit.getBoundingClientRect();
      rx = clamp(((e.clientX - r.left) / r.width  - 0.5) * 2) * amount;
      ry = clamp(((e.clientY - r.top)  / r.height - 0.5) * 2) * amount;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        target.style.setProperty('--rx', rx.toFixed(2));
        target.style.setProperty('--ry', ry.toFixed(2));
        raf = null;
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

  /* The ghost word drifts against the scroll. It is display:none below the
     820px breakpoint, so the subscription costs a rect read and nothing
     else there; the observer keeps it idle off-screen. */
  const bgText = $('.hero__bg-text');
  if (bgText && hero) {
    let visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(hero);
    }
    let drifting = false;
    onScroll(() => {
      if (reduced.matches) {
        if (drifting) { bgText.style.transform = ''; drifting = false; }
        return;
      }
      if (!visible) return;
      drifting = true;
      bgText.style.transform = `translate3d(-50%, calc(-50% + ${window.scrollY * 0.22}px), 0)`;
    });
  }

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
     and never under reduced motion -- `fine()` is already both of those. */
  const assinatura = $('.assinatura');
  if (assinatura && fine()) {
    assinatura.addEventListener('pointerenter', () => {
      const engine = window.__assinatura;
      if (engine && engine.play) engine.play();
    });
  }

  console.log('%cL&D Engenharia', 'font:700 20px Syne,sans-serif;color:#581328');
  console.log('%cEmpresa Júnior · UNESP São João da Boa Vista', 'color:#7a5c64');
})();
