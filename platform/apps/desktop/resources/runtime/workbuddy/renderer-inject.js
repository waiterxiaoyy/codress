((cssText, themeCatalog) => {
  const STATE_KEY = "__WORKBUDDY_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__WORKBUDDY_DREAM_SKIN_DISABLED__";
  const STORAGE_KEY = "workbuddy-dream-skin.active-theme";
  const STYLE_ID = "workbuddy-dream-skin-style";
  const CHROME_ID = "workbuddy-dream-skin-chrome";
  const PICKER_ID = "workbuddy-dream-skin-picker";
  const VERSION = __WORKBUDDY_DREAM_SKIN_VERSION_JSON__;
  const ROOT_VARIABLES = [
    "--workbuddy-dream-art",
    "--workbuddy-dream-name",
    "--workbuddy-dream-tagline",
    "--wbds-bg",
    "--wbds-panel",
    "--wbds-panel-alt",
    "--wbds-surface",
    "--wbds-surface-alt",
    "--wbds-sidebar",
    "--wbds-control",
    "--wbds-accent",
    "--wbds-accent-alt",
    "--wbds-secondary",
    "--wbds-highlight",
    "--wbds-text",
    "--wbds-muted",
    "--wbds-sidebar-text",
    "--wbds-sidebar-muted",
    "--wbds-hero-text",
    "--wbds-hero-muted",
    "--wbds-veil",
    "--wbds-veil-soft",
    "--wbds-line",
  ];

  const previous = window[STATE_KEY];
  if (previous?.cleanup) previous.cleanup();
  window[DISABLED_KEY] = false;

  const createArtUrl = (dataUrl) => {
    const comma = dataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/jpeg";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };

  const rawThemes = Array.isArray(themeCatalog?.themes) ? themeCatalog.themes : [];
  const themes = rawThemes.map((raw) => {
    const { artDataUrl, ...theme } = raw;
    return { ...theme, artUrl: createArtUrl(artDataUrl) };
  });
  if (!themes.length) throw new Error("WorkBuddy Dream Skin theme catalog is empty");
  const themesById = new Map(themes.map((theme) => [theme.id, theme]));
  const storedThemeId = (() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  })();
  let activeTheme = themesById.get(storedThemeId)
    || themesById.get(themeCatalog?.defaultThemeId)
    || themes[0];

  const cssString = (value) => JSON.stringify(String(value ?? ""));
  const applyVariables = (root, theme) => {
    const colors = theme.colors || {};
    const variables = {
      "--wbds-bg": colors.background || "#070a16",
      "--wbds-panel": colors.panel || "#0e1530",
      "--wbds-panel-alt": colors.panelAlt || "#182248",
      "--wbds-surface": colors.surface || "rgba(14, 21, 48, .92)",
      "--wbds-surface-alt": colors.surfaceAlt || "rgba(24, 34, 72, .88)",
      "--wbds-sidebar": colors.sidebar || "rgba(7, 10, 22, .95)",
      "--wbds-control": colors.control || "rgba(10, 15, 34, .95)",
      "--wbds-accent": colors.accent || "#8b7cff",
      "--wbds-accent-alt": colors.accentAlt || "#d478ff",
      "--wbds-secondary": colors.secondary || "#44d8ff",
      "--wbds-highlight": colors.highlight || "#ff6bb5",
      "--wbds-text": colors.text || "#f3f5ff",
      "--wbds-muted": colors.muted || "#adb5d4",
      "--wbds-sidebar-text": colors.sidebarText || colors.text || "#f3f5ff",
      "--wbds-sidebar-muted": colors.sidebarMuted || colors.muted || "#adb5d4",
      "--wbds-hero-text": colors.heroText || "#ffffff",
      "--wbds-hero-muted": colors.heroMuted || colors.muted || "#adb5d4",
      "--wbds-veil": colors.veil || "rgba(4, 7, 18, .86)",
      "--wbds-veil-soft": colors.veilSoft || "rgba(13, 15, 37, .42)",
      "--wbds-line": colors.line || "rgba(139, 124, 255, .30)",
    };
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    root.style.setProperty("--workbuddy-dream-art", `url("${theme.artUrl}")`);
    root.style.setProperty("--workbuddy-dream-name", cssString(theme.name || "WorkBuddy Dream Skin"));
    root.style.setProperty("--workbuddy-dream-tagline", cssString(theme.tagline || "Make work feel lighter."));
    root.setAttribute("data-workbuddy-dream-theme", theme.id);
    root.setAttribute("data-workbuddy-dream-appearance", theme.appearance || "dark");
    root.setAttribute("data-workbuddy-dream-effects", theme.effects || "stars");
  };

  const ensureStyle = (root) => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.workbuddyDreamSkinVersion !== VERSION) {
      style.textContent = cssText;
      style.dataset.workbuddyDreamSkinVersion = VERSION;
    }
  };

  const ensureChrome = () => {
    if (!document.body) return;
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="workbuddy-dream-skin-status"><i></i><span></span></div>
        <div class="workbuddy-dream-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="workbuddy-dream-skin-festival">
          <div class="workbuddy-dream-skin-festival__ticker">
            <b>限时拼单会场</b><span>红包雨进行中</span><span>多人组队 · 今日加码</span><em>任务完成，好运 +1</em>
          </div>
          <div class="workbuddy-dream-skin-festival__ops">
            <span>🔥 今日爆款</span><span>🧧 拼单券已到账</span><span>⚡ 百人团开拼</span>
          </div>
          <div class="workbuddy-dream-skin-festival__rain">${"<i></i>".repeat(28)}</div>
        </div>
        <div class="workbuddy-dream-skin-theme-symbols">${"<i></i>".repeat(14)}</div>`;
      document.body.appendChild(chrome);
    }
    chrome.querySelector(".workbuddy-dream-skin-status span").textContent =
      activeTheme.statusText || "DREAM WORKSPACE ONLINE";
  };

  const setPickerOpen = (open) => {
    const picker = document.getElementById(PICKER_ID);
    const panel = picker?.querySelector(".workbuddy-dream-skin-picker__panel");
    const trigger = picker?.querySelector(".workbuddy-dream-skin-picker__trigger");
    if (!panel || !trigger) return;
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    picker.classList.toggle("is-open", open);
  };

  const updatePicker = () => {
    const picker = document.getElementById(PICKER_ID);
    if (!picker) return;
    const currentName = picker.querySelector(".workbuddy-dream-skin-picker__current");
    if (currentName) currentName.textContent = activeTheme.name;
    for (const card of picker.querySelectorAll("[data-theme-id]")) {
      const selected = card.dataset.themeId === activeTheme.id;
      card.classList.toggle("is-active", selected);
      card.setAttribute("aria-pressed", String(selected));
    }
  };

  const switchTheme = (themeId, persist = true) => {
    const theme = themesById.get(themeId);
    if (!theme) return { switched: false, themeId: activeTheme.id };
    activeTheme = theme;
    const root = document.documentElement;
    if (root) applyVariables(root, activeTheme);
    const status = document.querySelector(".workbuddy-dream-skin-status span");
    if (status) status.textContent = activeTheme.statusText || "DREAM WORKSPACE ONLINE";
    updatePicker();
    const state = window[STATE_KEY];
    if (state) state.themeId = activeTheme.id;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, activeTheme.id); } catch {}
    }
    return { switched: true, themeId: activeTheme.id, themeName: activeTheme.name };
  };

  const createPicker = () => {
    const picker = document.createElement("div");
    picker.id = PICKER_ID;
    picker.dataset.workbuddyDreamSkinVersion = VERSION;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "workbuddy-dream-skin-picker__trigger";
    trigger.setAttribute("aria-label", "切换 WorkBuddy 皮肤");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.title = "切换 WorkBuddy 皮肤";
    const triggerIcon = document.createElement("span");
    triggerIcon.className = "workbuddy-dream-skin-picker__trigger-icon";
    triggerIcon.setAttribute("aria-hidden", "true");
    triggerIcon.textContent = "🎨";
    const triggerName = document.createElement("span");
    triggerName.className = "workbuddy-dream-skin-picker__current";
    trigger.append(triggerIcon, triggerName);

    const panel = document.createElement("section");
    panel.className = "workbuddy-dream-skin-picker__panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "选择皮肤");
    panel.hidden = true;

    const header = document.createElement("header");
    header.className = "workbuddy-dream-skin-picker__header";
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "换个心情上班";
    const subtitle = document.createElement("small");
    subtitle.textContent = "选择后会自动记住";
    heading.append(title, subtitle);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "workbuddy-dream-skin-picker__close";
    close.setAttribute("aria-label", "关闭皮肤面板");
    close.textContent = "×";
    header.append(heading, close);

    const grid = document.createElement("div");
    grid.className = "workbuddy-dream-skin-picker__grid";
    for (const theme of themes) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "workbuddy-dream-skin-picker__card";
      card.dataset.themeId = theme.id;
      card.setAttribute("aria-pressed", "false");

      const preview = document.createElement("span");
      preview.className = "workbuddy-dream-skin-picker__preview";
      preview.style.backgroundImage = `linear-gradient(90deg, rgba(0,0,0,.16), transparent), url("${theme.artUrl}")`;
      const emoji = document.createElement("i");
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = theme.emoji || "✦";
      preview.appendChild(emoji);

      const copy = document.createElement("span");
      copy.className = "workbuddy-dream-skin-picker__copy";
      const name = document.createElement("strong");
      name.textContent = theme.name;
      const description = document.createElement("small");
      description.textContent = theme.description || theme.tagline || "";
      copy.append(name, description);

      const check = document.createElement("span");
      check.className = "workbuddy-dream-skin-picker__check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      card.append(preview, copy, check);
      card.addEventListener("click", () => {
        switchTheme(theme.id, true);
        setPickerOpen(false);
        trigger.focus({ preventScroll: true });
      });
      grid.appendChild(card);
    }

    trigger.addEventListener("click", () => setPickerOpen(panel.hidden));
    close.addEventListener("click", () => {
      setPickerOpen(false);
      trigger.focus({ preventScroll: true });
    });
    panel.append(header, grid);
    picker.append(trigger, panel);
    return picker;
  };

  const ensurePicker = () => {
    if (!document.body) return;
    let picker = document.getElementById(PICKER_ID);
    if (!picker || picker.parentElement !== document.body) {
      picker?.remove();
      picker = createPicker();
      document.body.appendChild(picker);
    }
    updatePicker();
  };

  const ensure = () => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    root.classList.add("workbuddy-dream-skin");
    root.setAttribute("data-workbuddy-dream-home", document.querySelector(".wb-home-page") ? "true" : "false");
    ensureStyle(root);
    ensureChrome();
    ensurePicker();
    applyVariables(root, activeTheme);
  };

  const documentClickHandler = (event) => {
    const picker = document.getElementById(PICKER_ID);
    if (picker?.classList.contains("is-open") && !picker.contains(event.target)) setPickerOpen(false);
  };
  const keyHandler = (event) => {
    if (event.key === "Escape") setPickerOpen(false);
  };
  document.addEventListener("pointerdown", documentClickHandler, true);
  document.addEventListener("keydown", keyHandler, true);

  const cleanup = () => {
    window[DISABLED_KEY] = true;
    const root = document.documentElement;
    root?.classList.remove("workbuddy-dream-skin");
    root?.removeAttribute("data-workbuddy-dream-home");
    root?.removeAttribute("data-workbuddy-dream-theme");
    root?.removeAttribute("data-workbuddy-dream-appearance");
    root?.removeAttribute("data-workbuddy-dream-effects");
    for (const variable of ROOT_VARIABLES) root?.style.removeProperty(variable);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(PICKER_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    document.removeEventListener("pointerdown", documentClickHandler, true);
    document.removeEventListener("keydown", keyHandler, true);
    for (const theme of themes) URL.revokeObjectURL(theme.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-vscode-theme-kind", "data-vscode-theme-name"],
  });
  const timer = setInterval(ensure, 4000);
  const resizeHandler = scheduleEnsure;
  window.addEventListener("resize", resizeHandler, { passive: true });

  window[STATE_KEY] = {
    ensure,
    cleanup,
    switchTheme,
    observer,
    timer,
    scheduler,
    resizeHandler,
    version: VERSION,
    themeId: activeTheme.id,
    themes: themes.map(({ artUrl, ...theme }) => theme),
  };
  ensure();
  return { installed: true, version: VERSION, themeId: activeTheme.id, themeCount: themes.length };
})(
  __WORKBUDDY_DREAM_SKIN_CSS_JSON__,
  __WORKBUDDY_DREAM_SKIN_CATALOG_JSON__
)
