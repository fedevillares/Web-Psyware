/* ============================================================
   PSYWARE — home.js
   Smooth scroll (Lenis) + GSAP/ScrollTrigger: hero con secuencia
   de frames WebP en canvas scrubbed por scroll, reveals por líneas, count-up, video de
   peritajes diferido y CTAs magnéticos.
   El <head> decide html.motion / html.scrub antes de pintar.
   ============================================================ */
(() => {
  "use strict";

  const root = document.documentElement;
  const hasMotion = root.classList.contains("motion");
  const hasScrub = root.classList.contains("scrub");
  const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  window.__homeReady = true;

  /* Sin GSAP no hay movimiento: se vuelve al layout estático */
  if (!hasGsap) {
    root.classList.remove("motion", "scrub");
    initPericiaVideo(false);
    return;
  }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  const EASE = "expo.out";
  let lenis = null;

  /* ---------------------------------------------------------
     Smooth scroll
     --------------------------------------------------------- */
  function initLenis() {
    if (!hasScrub || typeof window.Lenis === "undefined") return;
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToTarget(target, offset = 0) {
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.2 });
    else {
      const y = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY + offset;
      window.scrollTo({ top: y, behavior: hasMotion ? "smooth" : "auto" });
    }
  }

  function initAnchors() {
    document.querySelectorAll('a[data-anchor][href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        scrollToTarget(target);
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        history.replaceState(null, "", link.getAttribute("href"));
      });
    });
  }

  /* ---------------------------------------------------------
     Hero: video scrubbed + textos por fase
     --------------------------------------------------------- */
  function initHero() {
    if (!hasScrub) return;

    const hero = document.getElementById("inicio");
    const canvas = document.getElementById("heroCanvas");
    const ctx = canvas && canvas.getContext("2d");
    if (!hero || !ctx) return;

    const phaseA = hero.querySelector('[data-phase="a"]');
    const phaseB = hero.querySelector('[data-phase="b"]');
    const phaseC = hero.querySelector('[data-phase="c"]');
    const cue = hero.querySelector(".hero__cue");
    const dim = hero.querySelector(".hero__dim");
    const linesA = phaseA.querySelectorAll(".line > span");
    const leadA = phaseA.querySelector(".hero__lead");
    const linesB = phaseB.querySelectorAll(".line > span");
    const linesC = phaseC.querySelectorAll(".line > span");
    const actionsC = phaseC.querySelector(".hero__actions");

    /* Secuencia de frames WebP pintada en canvas: cada fotograma es una
       imagen ya decodificada, así el scrub no depende de seeks del video.
       Vertical usa un recorte central más liviano y nítido. */
    const COUNT = Number(canvas.dataset.count) || 1;
    const COARSE = 8;        // primero 1 de cada 8 frames, después el resto
    const CONCURRENCY = 6;
    const portrait = window.matchMedia("(orientation: portrait)");
    let frames = [];
    let base = "";
    let generation = 0;
    let started = false;
    let target = 0;
    let current = 0;
    let drawn = -1;
    let dirty = true;

    const frameUrl = (i) => `${base}${String(i + 1).padStart(4, "0")}.webp`;

    function loadFrames() {
      const gen = ++generation;
      base = portrait.matches ? canvas.dataset.framesMobile : canvas.dataset.frames;
      frames = new Array(COUNT);
      drawn = -1;
      dirty = true;
      const coarse = [];
      const fine = [];
      for (let i = 0; i < COUNT; i++) (i % COARSE === 0 || i === COUNT - 1 ? coarse : fine).push(i);
      const queue = coarse.concat(fine);
      let next = 0;
      let active = 0;
      const pump = () => {
        while (gen === generation && active < CONCURRENCY && next < queue.length) {
          const i = queue[next++];
          const img = new Image();
          active++;
          img.decoding = "async";
          img.onload = () => {
            if (gen !== generation) return;
            frames[i] = img;
            if (Math.abs(i - Math.round(current)) <= COARSE) dirty = true;
            active--; pump();
          };
          img.onerror = () => { active--; pump(); };
          img.src = frameUrl(i);
        }
      };
      pump();
    }

    /* Se pide después del load (o ante la primera intención de scroll)
       para no competir con el LCP; el póster ya es el frame 1 */
    const intents = ["wheel", "touchstart", "pointermove", "keydown", "scroll"];
    const start = () => {
      if (started) return;
      started = true;
      intents.forEach((t) => window.removeEventListener(t, start));
      loadFrames();
    };
    const arm = () => {
      if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1200 });
      else setTimeout(start, 300);
      intents.forEach((t) => window.addEventListener(t, start, { once: true, passive: true }));
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    if (window.scrollY > 0) start();

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      dirty = true;
    }

    /* El frame pedido o, si todavía no llegó, el cargado más cercano */
    function nearest(i) {
      if (frames[i]) return frames[i];
      for (let d = 1; d < COUNT; d++) {
        if (i - d >= 0 && frames[i - d]) return frames[i - d];
        if (i + d < COUNT && frames[i + d]) return frames[i + d];
      }
      return null;
    }

    function draw(i) {
      const img = nearest(i);
      if (!img || !img.naturalWidth) return false;
      const cw = canvas.width;
      const ch = canvas.height;
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      if (!canvas.classList.contains("is-ready")) canvas.classList.add("is-ready");
      return true;
    }

    sizeCanvas();
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        sizeCanvas();
        const want = portrait.matches ? canvas.dataset.framesMobile : canvas.dataset.frames;
        if (started && want !== base) loadFrames();
      }, 150);
    };
    if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(canvas);
    else window.addEventListener("resize", onResize);

    const scrub = ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => { target = self.progress; },
    });

    gsap.ticker.add(() => {
      if (!started) return;
      const goal = target * (COUNT - 1);
      current += (goal - current) * 0.15;
      if (Math.abs(goal - current) < 0.01) current = goal;
      const i = Math.round(current);
      if ((i !== drawn || dirty) && draw(i)) { drawn = i; dirty = false; }
    });

    /* Línea de tiempo de textos sobre el progreso 0–1 */
    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom bottom", scrub: true },
    });

    tl.to(cue, { autoAlpha: 0, duration: 0.04 }, 0.01)
      .to(dim, { opacity: 0.08, duration: 0.3 }, 0)
      // Fase A: 0–25 %
      .to(linesA, { yPercent: -150, duration: 0.07, stagger: 0.012, ease: "power2.in" }, 0.18)
      .to(leadA, { autoAlpha: 0, y: -16, duration: 0.05, ease: "power2.in" }, 0.18)
      // Fase B: 40–65 %
      .set(phaseB, { autoAlpha: 1 }, 0.38)
      .fromTo(linesB, { y: 0, yPercent: 130 }, { y: 0, yPercent: 0, duration: 0.07, stagger: 0.015, ease: "power2.out" }, 0.38)
      .to(dim, { opacity: 0.16, duration: 0.25 }, 0.45)
      .to(linesB, { yPercent: -150, duration: 0.06, stagger: 0.012, ease: "power2.in" }, 0.6)
      .set(phaseB, { autoAlpha: 0 }, 0.68)
      // Fase C: 82–100 %
      .set(phaseC, { opacity: 1 }, 0.8)
      .fromTo(linesC, { y: 0, yPercent: 130 }, { y: 0, yPercent: 0, duration: 0.07, stagger: 0.015, ease: "power2.out" }, 0.8)
      .fromTo(actionsC, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: "power2.out" }, 0.85)
      .to(dim, { opacity: 0.45, duration: 0.15 }, 0.82)
      .set({}, {}, 1);

    /* Los CTAs de la fase C son interactivos solo cuando se ven */
    ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => phaseC.classList.toggle("is-live", self.progress >= 0.82),
    });

    /* Teclado: al enfocar un CTA oculto, llevar el scroll hasta él */
    phaseC.addEventListener("focusin", () => {
      if (scrub.progress < 0.9) scrollToTarget(scrub.start + (scrub.end - scrub.start) * 0.94);
    });
  }

  /* ---------------------------------------------------------
     Reveals: títulos por líneas, bloques y grupos escalonados
     --------------------------------------------------------- */
  function initReveals() {
    if (!hasMotion) return;

    document.querySelectorAll("[data-split]").forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        once: true,
        onEnter: () => {
          const spans = el.querySelectorAll(".line > span");
          gsap.fromTo(spans, { y: 0, yPercent: 130 }, {
            y: 0, yPercent: 0, duration: 1.1, stagger: 0.08, ease: EASE, clearProps: "transform",
          });
          el.classList.add("is-in");
        },
      });
    });

    document.querySelectorAll("[data-reveal]").forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => {
          gsap.fromTo(el, { autoAlpha: 0, y: 16 }, {
            autoAlpha: 1, y: 0, duration: 0.9, delay: 0.08, ease: EASE, clearProps: "transform,opacity,visibility",
          });
          el.classList.add("is-in");
        },
      });
    });

    document.querySelectorAll("[data-stagger]").forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        once: true,
        onEnter: () => {
          gsap.fromTo(el.children, { autoAlpha: 0, y: 24 }, {
            autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.07, ease: EASE, clearProps: "transform,opacity,visibility",
          });
          el.classList.add("is-in");
        },
      });
    });
  }

  /* ---------------------------------------------------------
     Parallax mínimo (máx. 12 px)
     --------------------------------------------------------- */
  function initParallax() {
    if (!hasScrub) return;
    document.querySelectorAll("[data-parallax]").forEach((el) => {
      const amount = Math.min(12, Number(el.dataset.parallax) || 8);
      gsap.fromTo(el, { y: -amount }, {
        y: amount,
        ease: "none",
        scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
      });
    });
  }

  /* ---------------------------------------------------------
     Count-up (una sola vez)
     --------------------------------------------------------- */
  function initCounters() {
    if (!hasMotion) return;
    document.querySelectorAll("[data-count]").forEach((el) => {
      const end = Number(el.dataset.count);
      if (!Number.isFinite(end)) return;
      const state = { v: 0 };
      el.textContent = "0";
      ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => {
          gsap.to(state, {
            v: end,
            duration: 1.4,
            ease: "power3.out",
            onUpdate: () => { el.textContent = String(Math.round(state.v)); },
          });
        },
      });
    });
  }

  /* ---------------------------------------------------------
     Marquee de clientes: duplica la lista para el loop
     --------------------------------------------------------- */
  function initMarquee() {
    if (!hasMotion) return;
    const track = document.querySelector("[data-marquee] .marquee__track");
    if (!track) return;
    Array.from(track.children).forEach((li) => {
      const clone = li.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("a").forEach((a) => a.setAttribute("tabindex", "-1"));
      track.appendChild(clone);
    });
  }

  /* ---------------------------------------------------------
     CTAs magnéticos (solo puntero fino)
     --------------------------------------------------------- */
  function initMagnetic() {
    if (!hasMotion || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const MAX = 8;
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * MAX;
        const dy = ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * (MAX * 0.6);
        el.style.setProperty("--mx", `${dx.toFixed(2)}px`);
        el.style.setProperty("--my", `${dy.toFixed(2)}px`);
      });
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--mx", "0px");
        el.style.setProperty("--my", "0px");
      });
    });
  }

  /* ---------------------------------------------------------
     Video de peritajes: carga al acercarse, reproduce una vez
     y queda en el último fotograma
     --------------------------------------------------------- */
  function initPericiaVideo(autoplay) {
    const video = document.getElementById("periciaVideo");
    if (!video || !("IntersectionObserver" in window)) return;
    let loaded = false;
    let played = false;

    const load = () => {
      if (loaded) return;
      loaded = true;
      video.querySelectorAll("source[data-src]").forEach((s) => { s.src = s.dataset.src; });
      video.preload = "auto";
      video.load();
    };

    const near = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        load();
        near.disconnect();
      }
    }, { rootMargin: "75% 0px" });
    near.observe(video);

    if (!autoplay) return;
    const visible = new IntersectionObserver((entries) => {
      if (played || !entries.some((e) => e.isIntersecting)) return;
      played = true;
      load();
      const p = video.play();
      if (p && p.then) p.then(() => visible.disconnect()).catch(() => { played = false; });
      else visible.disconnect();
    }, { threshold: 0.4 });
    visible.observe(video);
  }

  /* ---------------------------------------------------------
     Botones flotantes: en móvil se apartan mientras se ve el hero,
     que ya tiene su propio CTA de WhatsApp
     --------------------------------------------------------- */
  function initFabInHero() {
    const hero = document.getElementById("inicio");
    if (!hero) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      document.body.classList.toggle("in-hero", hero.getBoundingClientRect().bottom > window.innerHeight * 0.6);
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* --------------------------------------------------------- */
  initFabInHero();
  initLenis();
  initAnchors();
  initHero();
  initMarquee();
  initReveals();
  initParallax();
  initCounters();
  initMagnetic();
  initPericiaVideo(hasMotion);

  /* Recalcular posiciones cuando cargan fuentes e imágenes */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
