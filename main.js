(() => {
  const THEME_KEY = "ais-theme";
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Theme toggle (dark ↔ light, OpenClaw-style)
  const themeBtn = document.querySelector("[data-theme-toggle]");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const syncThemeChrome = (theme) => {
    const next = theme === "light" ? "light" : "dark";
    if (themeMeta) {
      themeMeta.setAttribute(
        "content",
        next === "light" ? "#f6f5f3" : "#101012"
      );
    }
    if (themeBtn) {
      themeBtn.setAttribute(
        "aria-label",
        next === "light" ? "Switch to dark theme" : "Switch to light theme"
      );
      themeBtn.setAttribute(
        "title",
        next === "light" ? "Dark theme" : "Light theme"
      );
    }
  };

  const setTheme = (theme, { persist = true } = {}) => {
    const next = theme === "light" ? "light" : "dark";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    if (persist) localStorage.setItem(THEME_KEY, next);
    syncThemeChrome(next);
  };

  // Chrome labels for whatever the boot script already chose
  syncThemeChrome(root.dataset.theme || "dark");

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      setTheme(root.dataset.theme === "light" ? "dark" : "light");
    });
  }

  // Mobile menu
  const menuBtn = document.querySelector("[data-menu-toggle]");
  const menu = document.getElementById("site-menu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", () => {
      const open = menu.hasAttribute("hidden");
      if (open) {
        menu.removeAttribute("hidden");
        menuBtn.setAttribute("aria-expanded", "true");
        menuBtn.setAttribute("aria-label", "Close menu");
      } else {
        menu.setAttribute("hidden", "");
        menuBtn.setAttribute("aria-expanded", "false");
        menuBtn.setAttribute("aria-label", "Open menu");
      }
    });
    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menu.setAttribute("hidden", "");
        menuBtn.setAttribute("aria-expanded", "false");
        menuBtn.setAttribute("aria-label", "Open menu");
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Hero: quiet OpenClaw-style dot aura (subtle idle + soft hover drift)
  // ---------------------------------------------------------------------------
  function startHeroDots(canvas) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return () => {};

    const hero = canvas.closest(".hero") || canvas.parentElement;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!hero || !ctx) return () => {};

    const dots = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let mx = -9999;
    let my = -9999;
    let smx = -9999;
    let smy = -9999;
    let active = false;
    let raf = 0;
    let stopped = false;
    let visible = true;
    let t0 = performance.now();

    const hexToRgb = (hex) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
      if (!m) return { r: 155, g: 218, b: 72 };
      return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
      };
    };

    const readPrimary = () => {
      const s = getComputedStyle(document.documentElement);
      return hexToRgb(
        s.getPropertyValue("--accent-primary").trim() ||
          s.getPropertyValue("--lime-bright").trim() ||
          "#9bda48"
      );
    };

    let rgb = readPrimary();
    const frac = (n) => n - Math.floor(n);

    const layout = () => {
      const rect = hero.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const gap = w < 720 ? 24 : 26;
      const cx = w * 0.5;
      const cy = h * 0.38;
      const rx = w * 0.5;
      const ry = h * 0.46;

      dots.length = 0;
      const x0 = (w % gap) / 2;
      const y0 = (h % gap) / 2;
      for (let y = y0; y <= h; y += gap) {
        for (let x = x0; x <= w; x += gap) {
          const nx = (x - cx) / rx;
          const ny = (y - cy) / ry;
          const d = Math.hypot(nx, ny);
          if (d > 1.08) continue;
          const aura = Math.max(0, 1 - d * d);
          // Keep the terminal zone calmer
          const hole = Math.hypot((x - cx) / (w * 0.24), (y - cy) / (h * 0.22));
          const holeFade = hole < 0.6 ? 0.25 + (hole / 0.6) * 0.75 : 1;
          const n1 = frac(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
          const n2 = frac(Math.sin(x * 4.1414 + y * 2.718) * 23421.631);
          dots.push({
            ox: x + (n1 - 0.5) * 1.1,
            oy: y + (n2 - 0.5) * 1.1,
            x,
            y,
            vx: 0,
            vy: 0,
            // Low alpha — texture, not decoration
            base: (0.06 + aura * 0.28) * holeFade,
            r: 0.9 + aura * 0.35,
            phase: n1 * Math.PI * 2,
          });
        }
      }
      rgb = readPrimary();
    };

    const paintStatic = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        if (d.base < 0.03) continue;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${d.base})`;
        ctx.arc(d.ox, d.oy, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = (now) => {
      if (stopped || !visible) {
        raf = 0;
        return;
      }

      const t = now - t0;
      const influence = w < 720 ? 70 : 88;

      if (active) {
        smx += (mx - smx) * 0.12;
        smy += (my - smy) * 0.12;
      }

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        // Tiny idle drift only
        let tx = d.ox + Math.sin(t * 0.00035 + d.phase) * 0.7;
        let ty = d.oy + Math.cos(t * 0.0003 + d.phase * 1.1) * 0.55;

        // Soft, small push away from cursor — barely noticeable
        if (active) {
          const dx = d.ox - smx;
          const dy = d.oy - smy;
          const dist = Math.hypot(dx, dy) || 0.001;
          if (dist < influence) {
            const u = 1 - dist / influence;
            const ease = u * u;
            const force = ease * 5.5;
            tx += (dx / dist) * force;
            ty += (dy / dist) * force;
          }
        }

        d.vx += (tx - d.x) * 0.1;
        d.vy += (ty - d.y) * 0.1;
        d.vx *= 0.82;
        d.vy *= 0.82;
        d.x += d.vx;
        d.y += d.vy;

        if (d.base < 0.03) continue;
        const lift = Math.min(1, Math.hypot(d.x - d.ox, d.y - d.oy) / 8);
        const alpha = Math.min(0.42, d.base + lift * 0.08);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
        ctx.arc(d.x, d.y, d.r + lift * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!raf && !stopped && visible && !reduceMotion) {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onPointer = (e) => {
      const rect = hero.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
      if (!active) {
        smx = mx;
        smy = my;
      }
      active = true;
      start();
    };
    const onLeave = () => {
      active = false;
    };

    layout();
    if (reduceMotion) paintStatic();
    else start();

    hero.addEventListener("pointermove", onPointer, { passive: true });
    hero.addEventListener("pointerenter", onPointer, { passive: true });
    hero.addEventListener("pointerleave", onLeave, { passive: true });

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        layout();
        if (reduceMotion) paintStatic();
        else start();
      }, 120);
    };
    window.addEventListener("resize", onResize, { passive: true });

    const themeObs = new MutationObserver(() => {
      rgb = readPrimary();
      if (reduceMotion) paintStatic();
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        if (visible) {
          if (reduceMotion) paintStatic();
          else start();
        } else stopLoop();
      },
      { rootMargin: "80px 0px" }
    );
    io.observe(hero);

    return () => {
      stopped = true;
      stopLoop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      hero.removeEventListener("pointermove", onPointer);
      hero.removeEventListener("pointerenter", onPointer);
      hero.removeEventListener("pointerleave", onLeave);
      themeObs.disconnect();
      io.disconnect();
    };
  }

  function startHeroTerminal(el) {
    if (!el) return;

    const deck = document.querySelector("[data-hero-deck]");
    const stepEl = document.querySelector("[data-hero-step]");
    const stepsEl = document.querySelector("[data-hero-steps]");
    const progressEl = document.querySelector("[data-hero-progress]");
    const prevBtn = document.querySelector("[data-hero-prev]");
    const nextBtn = document.querySelector("[data-hero-next]");

    // 4-step story: session → target → write → paste (light nerd humor, still real TUI).
    const sessionTitle = "Stop rewriting the same story for every CLI";
    const sessionHead = `<span class="t-accent">❯</span> <span class="t-cmd">grok</span> <span class="t-dim">· 1d ago ·</span> <span class="t-cmd">${sessionTitle}</span>`;
    const frames = [
      {
        hold: 5600,
        label: "Pick session",
        short: "Session",
        lines: [
          '<span class="t-prompt">$</span> <span class="t-cmd">ais resume</span>',
          '<span class="t-dim">Sessions for ~/code/openaiswitch</span>',
          '<span class="t-hint">   ↑ more (yes, you have a problem)</span>',
          '<span class="t-dim">  claude    12m ago      Explain this regex I wrote at 2am</span>',
          '<span class="t-dim">  codex     41m ago      It works on my machine™ — prove it in CI</span>',
          '<span class="t-dim">  opencode  2h ago       Name this variable without using tmp2</span>',
          '<span class="t-dim">  claude    5h ago       Is this a bug or a feature? (be honest)</span>',
          '<span class="t-dim">  codex     9h ago       git blame the previous me</span>',
          `<span class="t-accent">❯</span> <span class="t-cmd">grok      1d ago       ${sessionTitle}</span>`,
          '<span class="t-hint">  ↑/↓ move   enter select   q cancel</span>',
        ],
      },
      {
        hold: 5400,
        label: "Choose target",
        short: "Target",
        lines: [
          '<span class="t-prompt">$</span> <span class="t-cmd">ais resume</span>',
          sessionHead,
          '<span class="t-dim">What do you want to do with this conversation?</span>',
          '<span class="t-accent">❯</span> <span class="t-cmd">Continue in Claude</span>',
          '<span class="t-dim">  Continue in Codex</span>',
          '<span class="t-dim">  Continue in OpenCode</span>',
          '<span class="t-dim">  Continue in Antigravity</span>',
          '<span class="t-dim">  Continue in Grok</span>',
          '<span class="t-hint">   same plot, different co-author</span>',
          '<span class="t-hint">  ↑/↓ move   enter select   q cancel</span>',
        ],
      },
      {
        hold: 5200,
        spinner: true,
        label: "Write handoff",
        short: "Write",
        lines: [
          '<span class="t-prompt">$</span> <span class="t-cmd">ais resume</span>',
          sessionHead,
          '',
          '<span class="t-accent" data-spin>⠏</span> <span class="t-dim">grok (grok-4.5, high) is writing the detailed handoff</span>',
          '<span class="t-hint">   multi-pass · uses your grok quota</span>',
          '',
          '<span class="t-dim">   packing decisions, failed attempts, and “why not X?”…</span>',
        ],
      },
      {
        hold: 6000,
        label: "Ready to paste",
        short: "Paste",
        lines: [
          '<span class="t-prompt">$</span> <span class="t-cmd">ais resume</span>',
          sessionHead,
          '<span class="t-ok">✓</span> <span class="t-cmd">Handoff ready.</span>',
          '<span class="t-ok">✓</span> <span class="t-cmd">Handoff copied to clipboard</span> <span class="t-dim">(pbcopy · no retyping lore)</span>',
          '',
          '<span class="t-bar">▌</span>  <span class="t-warn">⚠</span>  <span class="t-cmd">Before you start</span>',
          '<span class="t-bar">▌</span>  <span class="t-dim">Paste the handoff into claude as your first message,</span>',
          '<span class="t-bar">▌</span>  <span class="t-dim">then continue from there.</span>',
          '',
          '<span class="t-accent">❯</span> <span class="t-cmd">Press Enter to open claude, then paste with Cmd+V / Ctrl+V ...</span>',
        ],
      },
    ];

    const total = frames.length;
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frameIdx = 0;
    let spinIdx = 0;
    let holdStart = 0;
    let holdUntil = 0;
    let raf = 0;
    let lastSpin = 0;
    let visible = true;
    let stopped = false;
    let autoplay = !reduceMotion;
    let swapping = false;

    if (stepsEl) {
      stepsEl.innerHTML = frames
        .map(
          (f, i) =>
            `<button type="button" class="hero-deck-step" role="tab" data-step="${i}" aria-selected="false" title="Step ${i + 1}: ${f.label}"><span class="hero-deck-step-n">${i + 1}</span><span class="hero-deck-step-label">${f.short}</span></button>`
        )
        .join("");
    }

    const stepButtons = () =>
      stepsEl ? Array.from(stepsEl.querySelectorAll(".hero-deck-step")) : [];

    const scrollActiveChip = () => {
      if (!stepsEl) return;
      const btn = stepButtons()[frameIdx];
      if (!btn) return;
      const left =
        btn.offsetLeft - stepsEl.clientWidth / 2 + btn.clientWidth / 2;
      stepsEl.scrollTo({
        left: Math.max(0, left),
        behavior: reduceMotion ? "auto" : "smooth",
      });
    };

    const paintChrome = () => {
      const frame = frames[frameIdx];
      if (stepEl) stepEl.textContent = `${frameIdx + 1}/${total} · ${frame.label}`;
      stepButtons().forEach((btn, i) => {
        const on = i === frameIdx;
        btn.classList.toggle("is-active", on);
        btn.classList.toggle("is-done", i < frameIdx);
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.tabIndex = on ? 0 : -1;
      });
      scrollActiveChip();
      if (progressEl) {
        progressEl.style.transform = "scaleX(0)";
      }
    };

    const paintBody = () => {
      const frame = frames[frameIdx];
      const glyph = spinnerFrames[spinIdx % spinnerFrames.length];
      const html = frame.lines
        .map((line) =>
          frame.spinner && line.includes("data-spin")
            ? `<span class="t-accent">${glyph}</span> <span class="t-dim">grok (grok-4.5, high) is writing the detailed handoff</span>`
            : line
        )
        .join("\n");
      el.innerHTML = html + (reduceMotion ? "" : '<span class="t-cursor"></span>');
    };

    const paint = () => {
      paintBody();
      paintChrome();
    };

    const setProgress = (ratio) => {
      if (!progressEl) return;
      const r = Math.max(0, Math.min(1, ratio));
      progressEl.style.transform = `scaleX(${r})`;
    };

    const armHold = (now = performance.now()) => {
      holdStart = now;
      holdUntil = now + frames[frameIdx].hold;
      setProgress(0);
    };

    const goTo = (idx, { user = false, animate = true } = {}) => {
      const next = ((idx % total) + total) % total;
      // Allow re-click of the active chip to restart its hold / progress.
      if (next === frameIdx && !user) return;
      if (next === frameIdx && user) {
        armHold();
        autoplay = !reduceMotion;
        return;
      }

      const apply = () => {
        frameIdx = next;
        spinIdx = 0;
        paint();
        armHold();
        el.classList.remove("is-swap");
        swapping = false;
        // Keep autoplay running after a manual jump so the story continues.
        if (user) autoplay = !reduceMotion;
      };

      if (!animate || reduceMotion) {
        apply();
        return;
      }

      swapping = true;
      el.classList.add("is-swap");
      window.setTimeout(apply, 320);
    };

    const tick = (now) => {
      if (stopped || document.hidden || !visible) {
        raf = 0;
        return;
      }

      if (!holdUntil) armHold(now);

      if (!swapping && frames[frameIdx].spinner && now - lastSpin >= 80) {
        lastSpin = now;
        spinIdx += 1;
        paintBody();
      }

      if (autoplay && !swapping) {
        const span = Math.max(1, holdUntil - holdStart);
        setProgress((now - holdStart) / span);
        if (now >= holdUntil) goTo(frameIdx + 1, { animate: true });
      }

      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!raf && !stopped && !document.hidden && visible) {
        if (!holdUntil) armHold();
        raf = requestAnimationFrame(tick);
      }
    };
    const pause = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    prevBtn?.addEventListener("click", () => goTo(frameIdx - 1, { user: true }));
    nextBtn?.addEventListener("click", () => goTo(frameIdx + 1, { user: true }));
    stepsEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-step]");
      if (!btn) return;
      e.preventDefault();
      goTo(Number(btn.dataset.step), { user: true });
    });

    deck?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(frameIdx - 1, { user: true });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(frameIdx + 1, { user: true });
      }
    });

    // Pause autoplay while hovering the deck so people can read or pick a step.
    const pauseAutoplay = () => {
      if (reduceMotion) return;
      autoplay = false;
    };
    const resumeAutoplay = () => {
      if (reduceMotion) return;
      autoplay = true;
      armHold();
    };
    deck?.addEventListener("pointerenter", pauseAutoplay);
    deck?.addEventListener("pointerleave", resumeAutoplay);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pause();
      else start();
    });

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        if (visible) start();
        else pause();
      },
      { rootMargin: "120px 0px" }
    );
    io.observe(deck || el);
    paint();
    start();

    return () => {
      stopped = true;
      pause();
      io.disconnect();
    };
  }

  startHeroDots(document.querySelector("[data-hero-dots]"));
  startHeroTerminal(document.querySelector("[data-hero-term]"));

  // ---------------------------------------------------------------------------
  // Scroll reveals
  // ---------------------------------------------------------------------------
  const revealEls = Array.from(document.querySelectorAll("[data-reveal]"));
  if (reduceMotion) {
    revealEls.forEach((el) => el.classList.add("is-in"));
  } else if (revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  // ---------------------------------------------------------------------------
  // Install snippets
  // ---------------------------------------------------------------------------
  const snippets = {
    source: {
      html: [
        '<div class="code-line"><span class="cmt"># requires Go 1.26+</span></div>',
        '<div class="code-line"><span class="prompt">$</span> git clone https://github.com/reigpol/openaiswitch.git</div>',
        '<div class="code-line"><span class="prompt">$</span> cd openaiswitch</div>',
        '<div class="code-line"><span class="prompt">$</span> go install ./cmd/ais</div>',
        '<div class="code-line"><span class="prompt">$</span> ais doctor</div>',
      ].join(""),
      copy: "git clone https://github.com/reigpol/openaiswitch.git\ncd openaiswitch\ngo install ./cmd/ais\nais doctor",
    },
    resume: {
      html: [
        '<div class="code-line"><span class="cmt"># pick a session and continue</span></div>',
        '<div class="code-line"><span class="prompt">$</span> ais resume</div>',
        '<div class="code-line"><span class="cmt"># newest session</span></div>',
        '<div class="code-line"><span class="prompt">$</span> ais resume --last</div>',
        '<div class="code-line"><span class="cmt"># same tool = native resume, no handoff</span></div>',
        '<div class="code-line"><span class="prompt">$</span> ais resume --last --tool claude --in claude</div>',
      ].join(""),
      copy: "ais resume\nais resume --last\nais resume --last --tool claude --in claude",
    },
    switch: {
      html: [
        '<div class="code-line"><span class="cmt"># Codex → Claude (creates a detailed handoff)</span></div>',
        '<div class="code-line"><span class="prompt">$</span> ais resume --last --tool codex --in claude</div>',
        '<div class="code-line"><span class="cmt"># handoff only, copy to clipboard</span></div>',
        '<div class="code-line"><span class="prompt">$</span> ais resume --last --copy</div>',
        '<div class="code-line"><span class="cmt"># pin model + effort for the source summarizer</span></div>',
        '<div class="code-line"><span class="prompt">$</span> ais resume --last --tool claude --model claude-opus-4-8 --effort high --in codex</div>',
      ].join(""),
      copy: "ais resume --last --tool codex --in claude\nais resume --last --copy\nais resume --last --tool claude --model claude-opus-4-8 --effort high --in codex",
    },
  };

  const codePanel = document.getElementById("install-code");
  const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
  const copyBtn = document.querySelector("[data-copy]");
  let activeMode = "source";

  function setMode(mode) {
    if (!snippets[mode] || !codePanel) return;
    activeMode = mode;
    codePanel.innerHTML = snippets[mode].html;
    modeButtons.forEach((btn) => {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (copyBtn) {
      copyBtn.classList.remove("copied");
      copyBtn.textContent = "Copy";
    }
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = snippets[activeMode]?.copy || "";
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied";
        copyBtn.classList.add("copied");
        window.setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1400);
      } catch {
        copyBtn.textContent = "Failed";
      }
    });
  }

  // Active nav on scroll
  const sections = ["#top", "#trap", "#how", "#tools", "#security"]
    .map((id) => document.querySelector(id))
    .filter(Boolean);
  const navLinks = Array.from(document.querySelectorAll(".site-nav-link"));

  function updateActiveNav() {
    const y = window.scrollY + 96;
    let current = "#top";
    for (const section of sections) {
      if (section.offsetTop <= y) current = `#${section.id}`;
    }
    navLinks.forEach((link) => {
      const href = link.getAttribute("href");
      const active = href === current;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  window.addEventListener("scroll", updateActiveNav, { passive: true });
  updateActiveNav();

  // ---------------------------------------------------------------------------
  // Scroll-linked tools rail (OpenClaw integrations style)
  // ---------------------------------------------------------------------------
  function startToolsRail(rootEl, reduce) {
    if (!rootEl) return () => {};

    const board = rootEl.querySelector(".tools-railboard");
    const scrubber = rootEl.querySelector(".tools-scrubber");
    const tracks = Array.from(rootEl.querySelectorAll(".tools-track"));
    const hint = rootEl.querySelector("[data-tools-hint]");
    if (!board || !scrubber || tracks.length === 0) return () => {};

    const cfg = {
      cloneBuffer: 96,
      minimumTravelCards: 1.25,
      edgeRevealMultiplier: 3.4,
      scrollEase: 0.075,
      scrubEase: 0.22,
      progressStart: 0.84,
      progressEnd: 0.18,
    };

    const clamp01 = (n) => Math.min(Math.max(n, 0), 1);

    const rows = tracks.map((row) => ({
      row,
      originals: Array.from(row.children).filter(
        (el) => el instanceof HTMLButtonElement && el.classList.contains("tool-card")
      ),
      direction: row.dataset.dir === "right" ? 1 : -1,
      travel: 0,
      base: 0,
    }));

    const ticks = Array.from(scrubber.querySelectorAll("span"));
    const ac = new AbortController();
    const { signal } = ac;

    let raf = 0;
    let progress = 0;
    let dragProgress = null;
    let scrollProgress = null;
    let visible = true;
    let stopped = false;

    const boardWidth = () => board.getBoundingClientRect().width;

    const measure = (rowState) => {
      const first = rowState.originals[0]?.getBoundingClientRect();
      const last = rowState.originals.at(-1)?.getBoundingClientRect();
      const cardW = first?.width ?? 178;
      const span = first && last ? last.right - first.left : cardW;
      const edge = Math.min(boardWidth() * 0.11, 96) * cfg.edgeRevealMultiplier;
      rowState.travel = Math.max(span - boardWidth() + edge, cardW * cfg.minimumTravelCards);
      rowState.base = rowState.direction === 1 ? -rowState.travel : 0;
    };

    const clearClones = (rowState) => {
      rowState.row.querySelectorAll("[data-tool-clone]").forEach((el) => el.remove());
    };

    const cloneCard = (card) => {
      const node = card.cloneNode(true);
      node.dataset.toolClone = "";
      node.setAttribute("aria-hidden", "true");
      node.tabIndex = -1;
      return node;
    };

    const fillClones = (rowState) => {
      const need = boardWidth() + rowState.travel + cfg.cloneBuffer;
      let guard = 0;
      while (rowState.row.scrollWidth < need && guard < 12) {
        rowState.originals.forEach((card) => rowState.row.append(cloneCard(card)));
        guard += 1;
      }
    };

    const layout = () => {
      rows.forEach(clearClones);
      rows.forEach((rowState) => {
        measure(rowState);
        fillClones(rowState);
      });
    };

    const xFor = (rowState, p) => rowState.base + rowState.direction * p * rowState.travel;

    const paint = (p) => {
      rows.forEach((rowState) => {
        rowState.row.style.transform = `translate3d(${xFor(rowState, p)}px, 0, 0)`;
      });
    };

    const paintScrubber = (p) => {
      const idx = p * (ticks.length - 1);
      ticks.forEach((tick, i) => {
        const d = Math.abs(i - idx);
        tick.classList.toggle("on", d < 1.2);
        tick.classList.toggle("near", d >= 1.2 && d < 3.4);
      });
      scrubber.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    };

    const scrollTarget = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const start = vh * cfg.progressStart;
      const end = vh * cfg.progressEnd;
      const rect = board.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      return clamp01((start - mid) / (start - end));
    };

    const pointerProgress = (e) => {
      const rect = scrubber.getBoundingClientRect();
      return clamp01((e.clientX - rect.left) / rect.width);
    };

    const setActive = (name) => {
      rootEl.querySelectorAll(".tool-card").forEach((card) => {
        const on = card.dataset.name === name;
        card.classList.toggle("is-active", on);
        card.setAttribute("aria-pressed", String(on));
      });
      if (hint && name) {
        const active = rootEl.querySelector(`.tool-card[data-name="${name}"]`);
        const label = active?.querySelector(".tool-name")?.textContent?.trim();
        const meta = active?.querySelector(".tool-meta")?.textContent?.trim();
        if (label) hint.textContent = `${label}${meta ? ` · ${meta}` : ""}`;
      }
    };

    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const loop = () => {
      if (stopped || !visible || document.hidden) {
        stopLoop();
        return;
      }
      const target = dragProgress ?? scrollProgress ?? scrollTarget();
      const ease = dragProgress == null && scrollProgress == null ? cfg.scrollEase : cfg.scrubEase;
      progress += (target - progress) * ease;
      paint(progress);
      paintScrubber(progress);
      raf = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (reduce || raf || stopped || !visible || document.hidden) return;
      raf = requestAnimationFrame(loop);
    };

    // Accessibility: only in-view cards tabbable
    const cardIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target instanceof HTMLButtonElement && !entry.target.dataset.toolClone) {
            entry.target.tabIndex = entry.intersectionRatio >= 0.5 ? 0 : -1;
          }
        });
      },
      { root: board, threshold: [0, 0.5] }
    );

    rows.forEach((rowState) => {
      rowState.originals.forEach((card) => {
        card.tabIndex = -1;
        cardIO.observe(card);
      });
    });

    layout();
    progress = reduce ? 0.5 : scrollTarget();
    paint(progress);
    paintScrubber(progress);

    if (!reduce) {
      const onPointerDown = (e) => {
        e.preventDefault();
        scrubber.setPointerCapture(e.pointerId);
        scrubber.classList.add("is-dragging");
        dragProgress = pointerProgress(e);
        scrollProgress = dragProgress;
        startLoop();
      };
      const onPointerMove = (e) => {
        if (!scrubber.classList.contains("is-dragging")) return;
        dragProgress = pointerProgress(e);
        scrollProgress = dragProgress;
      };
      const onPointerUp = (e) => {
        if (!scrubber.classList.contains("is-dragging")) return;
        scrubber.classList.remove("is-dragging");
        dragProgress = null;
        if (scrubber.hasPointerCapture(e.pointerId)) {
          scrubber.releasePointerCapture(e.pointerId);
        }
      };

      scrubber.addEventListener("pointerdown", onPointerDown, { signal });
      scrubber.addEventListener("pointermove", onPointerMove, { signal });
      scrubber.addEventListener("pointerup", onPointerUp, { signal });
      scrubber.addEventListener("pointercancel", onPointerUp, { signal });

      // Keyboard scrub
      scrubber.addEventListener(
        "keydown",
        (e) => {
          const step = e.shiftKey ? 0.1 : 0.04;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            scrollProgress = clamp01((scrollProgress ?? progress) + step);
            startLoop();
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            scrollProgress = clamp01((scrollProgress ?? progress) - step);
            startLoop();
          } else if (e.key === "Home") {
            e.preventDefault();
            scrollProgress = 0;
            startLoop();
          } else if (e.key === "End") {
            e.preventDefault();
            scrollProgress = 1;
            startLoop();
          }
        },
        { signal }
      );

      window.addEventListener(
        "scroll",
        () => {
          if (!scrubber.classList.contains("is-dragging")) {
            scrollProgress = null;
          }
          startLoop();
        },
        { passive: true, signal }
      );

      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) stopLoop();
          else startLoop();
        },
        { signal }
      );
    }

    rootEl.addEventListener(
      "click",
      (e) => {
        const card = e.target instanceof Element ? e.target.closest(".tool-card") : null;
        if (!card || card.dataset.toolClone != null) return;
        setActive(card.dataset.name);
      },
      { signal }
    );

    const ro = new ResizeObserver(() => {
      layout();
      paint(scrollProgress ?? progress);
      paintScrubber(scrollProgress ?? progress);
    });
    ro.observe(board);

    const visIO = reduce
      ? null
      : new IntersectionObserver(
          ([entry]) => {
            visible = entry?.isIntersecting ?? false;
            if (visible) startLoop();
            else stopLoop();
          },
          { rootMargin: "160px 0px" }
        );
    visIO?.observe(rootEl);
    startLoop();

    // Default highlight
    setActive("claude");

    return () => {
      if (stopped) return;
      stopped = true;
      stopLoop();
      ac.abort();
      ro.disconnect();
      visIO?.disconnect();
      cardIO.disconnect();
      rows.forEach(clearClones);
    };
  }

  startToolsRail(document.querySelector("[data-tools-rail]"), reduceMotion);
})();
