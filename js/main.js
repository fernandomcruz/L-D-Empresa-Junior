/* L&D ENGENHARIA — MAIN JAVASCRIPT */

document.addEventListener('DOMContentLoaded', () => {

  //  NAV SCROLL 
  const nav = document.getElementById('nav');
  function updateNav() {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  //  HAMBURGER MENU 
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  let menuOpen = false;

  hamburger.addEventListener('click', () => {
    menuOpen = !menuOpen;
    mobileMenu.classList.toggle('open', menuOpen);
    hamburger.setAttribute('aria-expanded', menuOpen);
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    const spans = hamburger.querySelectorAll('span');
    if (menuOpen) {
      spans[0].style.cssText = 'transform: rotate(45deg) translateY(7px)';
      spans[1].style.cssText = 'opacity: 0';
      spans[2].style.cssText = 'transform: rotate(-45deg) translateY(-7px)';
    } else {
      spans.forEach(s => s.style.cssText = '');
    }
  });

  document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      menuOpen = false;
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
      hamburger.querySelectorAll('span').forEach(s => s.style.cssText = '');
    });
  });

  //  SCROLL REVEAL 
  const revealEls = document.querySelectorAll('[data-reveal]');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const siblings = [...el.parentElement.querySelectorAll('[data-reveal]')];
        const delay = siblings.indexOf(el) * 80;
        setTimeout(() => el.classList.add('is-visible'), delay);
        revealObserver.unobserve(el);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => revealObserver.observe(el));

  //  COUNTER ANIMATION 
  const counters = document.querySelectorAll('[data-count]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target, parseInt(entry.target.getAttribute('data-count')));
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  function animateCounter(el, target) {
    const duration = 1800;
    const start = performance.now();
    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }
  counters.forEach(el => counterObserver.observe(el));

  //  SMOOTH ANCHOR SCROLL 
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: 'smooth' });
      }
    });
  });

  //  FORM SUBMIT (Netlify Forms) 
  const form = document.getElementById('contact-form');
  const successMsg = document.getElementById('form-success');

  function encodeFormData(data) {
    return Object.keys(data)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
      .join('&');
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const btnText = btn.querySelector('.btn-text');
      btnText.textContent = 'Enviando...';
      btn.disabled = true;
      btn.style.opacity = '0.7';

      const formData = new FormData(form);
      const payload = {};
      formData.forEach((value, key) => { payload[key] = value; });

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormData(payload)
      })
        .then(() => {
          form.reset();
          successMsg.classList.add('show');
          setTimeout(() => successMsg.classList.remove('show'), 5000);
        })
        .catch((error) => {
          console.error('Erro ao enviar o formulário:', error);
          alert('Não foi possível enviar sua mensagem agora. Tente novamente em instantes ou fale com a gente pelo e-mail led.eng.024@gmail.com.');
        })
        .finally(() => {
          btn.disabled = false;
          btn.style.opacity = '1';
          btnText.textContent = 'Enviar Mensagem';
        });
    });

    form.querySelectorAll('.form__input').forEach(input => {
      input.addEventListener('focus', () => {
        const lbl = input.parentElement.querySelector('.form__label');
        if (lbl) lbl.style.color = 'var(--vinho)';
      });
      input.addEventListener('blur', () => {
        const lbl = input.parentElement.querySelector('.form__label');
        if (lbl) lbl.style.color = '';
      });
    });
  }

  //  PARALLAX BG TEXT 
  const bgText = document.querySelector('.hero__bg-text');
  if (bgText) {
    window.addEventListener('scroll', () => {
      bgText.style.transform = `translate(-50%, calc(-50% + ${window.scrollY * 0.25}px))`;
    }, { passive: true });
  }

  //  TILT ON PROJETO CARDS 
  document.querySelectorAll('.projeto-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      card.style.transition = 'transform 0.1s ease, box-shadow 0.4s';
      card.style.borderRadius = '20px';
      card.style.transform = `scale(1.02) perspective(600px) rotateY(${dx * 4}deg) rotateX(${-dy * 4}deg)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s';
      card.style.borderRadius = '20px';
      card.style.transform = '';
    });
  });

  //  TILT ON HERO LOGO 
  const heroLogoTilt = document.querySelector('.hero__logo-tilt');
  if (heroLogoTilt) {
    heroLogoTilt.addEventListener('mousemove', (e) => {
      const rect = heroLogoTilt.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      heroLogoTilt.style.transition = 'transform 0.08s ease';
      heroLogoTilt.style.transform = `perspective(500px) rotateY(${dx * 18}deg) rotateX(${-dy * 18}deg) scale(1.07)`;
    });
    heroLogoTilt.addEventListener('mouseleave', () => {
      heroLogoTilt.style.transition = 'transform 0.9s cubic-bezier(0.16, 1, 0.3, 1)';
      heroLogoTilt.style.transform = '';
    });
  }

  //  ACTIVE NAV LINK HIGHLIGHT 
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__link:not(.nav__link--cta)');
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { threshold: 0.4 });
  sections.forEach(s => sectionObserver.observe(s));

  //  SOBRE CARDS STAGGER 
  const sobreCards = document.querySelectorAll('.sobre__card');
  const sobreObs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('is-visible'), i * 120);
        sobreObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  sobreCards.forEach(c => { c.setAttribute('data-reveal', ''); sobreObs.observe(c); });

  //  DIFERENCIAL QUOTE REVEAL 
  const quote = document.querySelector('.diferencial__quote');
  if (quote) {
    const quoteObs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        quote.style.cssText = 'opacity:0; transform:translateY(20px); transition:opacity 1s, transform 1s';
        requestAnimationFrame(() => {
          quote.style.opacity = '1';
          quote.style.transform = 'translateY(0)';
        });
        quoteObs.unobserve(quote);
      }
    }, { threshold: 0.3 });
    quoteObs.observe(quote);
  }
//  EQUIPE TABS 
  const tabs = document.querySelectorAll('.equipe__tab');
  const panels = document.querySelectorAll('.equipe__panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');

      tabs.forEach(t => t.classList.remove('equipe__tab--active'));
      panels.forEach(p => p.classList.remove('equipe__panel--active'));

      tab.classList.add('equipe__tab--active');
      const activePanel = document.querySelector(`[data-panel="${target}"]`);
      activePanel.classList.add('equipe__panel--active');

      
      activePanel.querySelectorAll('[data-reveal]:not(.is-visible)').forEach((el, i) => {
        setTimeout(() => el.classList.add('is-visible'), i * 40);
      });
    });
  });
  console.log('%cL&D Engenharia 🚀', 'font-size:20px; font-weight:bold; color:#581328;');
  console.log('%cEmpresa Júnior · UNESP São João da Boa Vista', 'color:#7a5c64;');
});