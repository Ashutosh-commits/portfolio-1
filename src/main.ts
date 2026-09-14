import { Application, Container } from 'pixi.js';
import gsap from 'gsap';
import { AquariumScene } from './aquarium';
import './styles.css';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>('#pixi-canvas');
  const aquarium = document.querySelector<HTMLElement>('#aquarium');
  const pageScroll = document.querySelector<HTMLElement>('.page-scroll');
  const header = document.querySelector<HTMLElement>('[data-header]');
  const hero = document.querySelector<HTMLElement>('.hero');
  const mobileMenu = document.querySelector<HTMLElement>('[data-mobile-menu]');
  const footer = document.querySelector<HTMLElement>('[data-footer]');

  if (!canvas || !aquarium || !pageScroll || !header || !hero || !mobileMenu || !footer) {
    throw new Error('Missing required portfolio elements');
  }

  const app = new Application();
  await app.init({
    canvas,
    resizeTo: window,
    antialias: false,
    backgroundAlpha: 0,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
    preference: 'webgl',
  });

  const root = new Container();
  app.stage.addChild(root);

  const scene = new AquariumScene(app, root, prefersReducedMotion.matches);
  await scene.load();
  scene.layout();

  const syncScrollRange = () => {
    scene.layout();

    pageScroll.style.height = `${window.innerHeight + scene.getMaxScrollPx()}px`;
    updateScrollState();
  };

  const updateScrollState = () => {
    const maxScroll = Math.max(1, scene.getMaxScrollPx());
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));

    header.classList.toggle('scrolled', progress > 0.12);
    const heroHidden = progress > 0.22;
    hero.classList.toggle('scrolled-away', heroHidden);
    hero.toggleAttribute('inert', heroHidden);
    scene.setScrollProgress(progress);
  };

  window.addEventListener('resize', syncScrollRange, { passive: true });
  window.addEventListener('scroll', updateScrollState, { passive: true });
  syncScrollRange();

  const footerObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          footer.classList.add('revealed');
          footerObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.25 },
  );
  footerObserver.observe(footer);

  const footerBuilt = document.querySelector<HTMLElement>('.footer-built');
  if (footerBuilt) {
    const words = footerBuilt.textContent?.trim().split(/\s+/) ?? [];
    footerBuilt.replaceChildren();
    words.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.style.setProperty('--i', String(index));
      span.textContent = word;
      footerBuilt.append(span);
      if (index < words.length - 1) footerBuilt.append(' ');
    });
  }

  if (!prefersReducedMotion.matches) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.16 },
    );
    document.querySelectorAll('[data-reveal], .section-title').forEach((el) => revealObserver.observe(el));
  } else {
    document.querySelectorAll('[data-reveal], .section-title').forEach((el) => el.classList.add('in-view'));
  }

  const reduceHandler = () => scene.setReducedMotion(prefersReducedMotion.matches);
  prefersReducedMotion.addEventListener?.('change', reduceHandler);

  const sound = document.querySelector<HTMLButtonElement>('[data-sound]');
  sound?.addEventListener('click', () => {
    const next = sound.getAttribute('aria-pressed') !== 'true';
    sound.setAttribute('aria-pressed', String(next));
    sound.setAttribute('aria-label', next ? 'Turn aquarium sound off' : 'Turn aquarium sound on');
    sound.classList.toggle('on', next);
  });

  const brand = document.querySelector<HTMLAnchorElement>('.brand');
  const brandMark = brand?.querySelector<SVGElement>('.brand-mark');
  brand?.addEventListener('click', () => {
    if (prefersReducedMotion.matches || !brandMark) return;

    brandMark.classList.remove('dash');
    void brandMark.getBoundingClientRect();
    brandMark.classList.add('dash');
  });
  brandMark?.addEventListener('animationend', () => brandMark.classList.remove('dash'));

  const theme = document.querySelector<HTMLButtonElement>('[data-theme]');
  theme?.addEventListener('click', () => {
    const enabled = !document.body.classList.contains('dark-mode');
    document.body.classList.toggle('dark-mode', enabled);
    theme.setAttribute('aria-pressed', String(enabled));
    theme.setAttribute('aria-label', enabled ? 'Switch to light mode' : 'Switch to dark mode');
    scene.setDarkMode(enabled);
  });

  const menu = document.querySelector<HTMLButtonElement>('[data-menu]');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    mobileMenu.hidden = !open;
    mobileMenu.classList.toggle('open', open);
  });

  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu?.setAttribute('aria-expanded', 'false');
      mobileMenu.hidden = true;
      mobileMenu.classList.remove('open');
    });
  });

  if (!prefersReducedMotion.matches) {

    gsap.timeline({ delay: 0.05 })
      .fromTo(
        '.hero-copy h1 .line-inner',
        { yPercent: 115, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.85, ease: 'power3.out', stagger: 0.14 },
      )
      .fromTo(
        '.hero-copy .role',
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out' },
        '-=0.35',
      )
      .fromTo(
        '.hero-actions .btn',
        { y: 16, opacity: 0, scale: 0.94 },
        { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.1 },
        '-=0.25',
      )
      .fromTo(
        '.hero-copy .socials a',
        { y: 12, opacity: 0, scale: 0.6 },
        { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.8)', stagger: 0.08 },
        '-=0.2',
      );
  }
}

boot().catch((error) => {
  console.error('Aquarium boot failed', error);
});
