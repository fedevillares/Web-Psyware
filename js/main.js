/* ============================================================
   PSYWARE — main.js (todas las páginas)
   Header (se oculta al bajar, vuelve al subir), barra de
   progreso, menú móvil y formulario de contacto. Sin dependencias.
   ============================================================ */
(() => {
  "use strict";

  /* ---------------------------------------------------------
     Header + barra de progreso (un solo listener de scroll)
     --------------------------------------------------------- */
  function initHeader() {
    const header = document.getElementById("navbar");
    const bar = document.getElementById("scrollProgress");
    if (!header && !bar) return;

    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);

      if (header) {
        header.classList.toggle("is-top", y < 8);
        const menuOpen = header.classList.contains("menu-open");
        const focusInside = header.contains(document.activeElement) && document.activeElement !== document.body;
        if (!menuOpen && !focusInside) {
          if (y > lastY + 4 && y > 120) header.classList.add("is-hidden");
          else if (y < lastY - 4 || y < 120) header.classList.remove("is-hidden");
        }
      }

      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      }

      lastY = y;
    };

    window.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    header?.addEventListener("focusin", () => header.classList.remove("is-hidden"));
    update();
  }

  /* ---------------------------------------------------------
     Menú móvil
     --------------------------------------------------------- */
  function initMobileMenu() {
    const header = document.getElementById("navbar");
    const toggle = document.getElementById("navToggle");
    const menu = document.getElementById("navMenu");
    if (!toggle || !menu) return;

    /* Con el menú abierto, el resto de la página queda inerte: el Tab
       no se escapa detrás del overlay y los lectores no lo recorren */
    const outside = () => [...document.body.children].filter((el) => el !== header && !el.contains(menu) && el.tagName !== "SCRIPT");

    const setOpen = (open) => {
      toggle.classList.toggle("is-open", open);
      menu.classList.toggle("is-open", open);
      header?.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      document.body.style.overflow = open ? "hidden" : "";
      outside().forEach((el) => { el.inert = open; });
      const lenis = window.__lenis;
      if (lenis) open ? lenis.stop() : lenis.start();
      if (open) {
        header?.classList.remove("is-hidden");
        menu.querySelector("a")?.focus({ preventScroll: true });
      }
    };

    toggle.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")));

    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", debounce(() => {
      if (window.innerWidth >= 1280 && menu.classList.contains("is-open")) setOpen(false);
    }, 150));
  }

  /* ---------------------------------------------------------
     Scroll reveal de las páginas internas (data-reveal / data-stagger)
     La home usa su propio sistema (home.js) y se excluye.
     --------------------------------------------------------- */
  function initScrollReveal() {
    if (document.body.classList.contains("home")) return;
    const targets = document.querySelectorAll("[data-reveal], [data-stagger]");
    if (!targets.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    targets.forEach((el) => {
      const delay = el.getAttribute("data-reveal-delay");
      if (delay) el.style.setProperty("--reveal-delay", `${delay}ms`);
    });

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      /* threshold 0: un bloque más alto que la pantalla (p. ej. el cuerpo
         de la política en móvil) nunca llegaría a mostrar el 15 % a la vez */
      { threshold: 0, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach((el) => observer.observe(el));
  }

  /* ---------------------------------------------------------
     Contact form — envío automático vía Web3Forms (mismo access key
     que los autodiagnósticos; CSP ya permite api.web3forms.com).
     --------------------------------------------------------- */
  function initContactForm() {
    const form = document.getElementById("contactForm");
    if (!form) return;

    const WEB3FORMS_KEY = "ae96a81b-fc42-41e3-a4c7-5c16fc1a9ba3";
    const status = document.getElementById("contactStatus");

    const setStatus = (kind, html) => {
      status.className = "form-status is-" + kind;
      status.innerHTML = html;
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const firstName = form.firstName.value.trim();
      const lastName = form.lastName.value.trim();
      const phone = form.phone.value.trim();
      const email = form.email.value.trim();
      const message = form.message.value.trim();

      const payload = {
        access_key: WEB3FORMS_KEY,
        botcheck: form.botcheck.checked ? "1" : "",
        subject: `Consulta desde psyware.ar — ${firstName} ${lastName}`,
        from_name: "Contacto Psyware",
        replyto: email,
        Nombre: `${firstName} ${lastName}`,
        Email: email,
        "Teléfono": phone || "—",
        message,
      };

      const submitBtn = form.querySelector("button[type='submit']");
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";
      setStatus("info", "Enviando tu mensaje…");

      fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((d) => {
          if (d && d.success) {
            form.reset();
            setStatus("ok", "✓ ¡Gracias, " + escapeHtml(firstName) + "! Recibimos tu mensaje y te respondemos a la brevedad.");
          } else {
            throw new Error("web3forms");
          }
        })
        .catch(() => {
          setStatus("err", 'No pudimos enviar el mensaje. Escribinos a <a href="mailto:contacto@psyware.ar">contacto@psyware.ar</a> o por WhatsApp.');
        })
        .then(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        });
    });
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------------------------------------------------------
     Misc
     --------------------------------------------------------- */
  function initFooterYear() {
    const el = document.getElementById("year");
    if (el) el.textContent = new Date().getFullYear();
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  const start = () => {
    initHeader();
    initMobileMenu();
    initScrollReveal();
    initContactForm();
    initFooterYear();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
