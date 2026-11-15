(function () {
  "use strict";

  const counterId = 114258187;
  const analyticsEnabled = false; // Включать после утверждения документов и разрешения на публикацию.
  const preferenceKey = "ffto-analytics-v2";
  const siteOrigin = "https://fencing-tomsk.ru";
  const publicPages = new Set([
    "/", "/start/", "/training/", "/news/", "/calendar/", "/results/",
    "/coaches/", "/organizations/", "/gallery/", "/contacts/", "/privacy/"
  ]);
  const pagePath = location.pathname.replace(/index\.html$/, "");
  if (!publicPages.has(pagePath)) return;

  const footer = document.querySelector(".footer-bottom");
  const links = document.createElement("div");
  links.className = "footer-analytics";
  links.innerHTML = '<a class="footer-privacy" href="/privacy/">Конфиденциальность</a>';
  footer?.append(links);

  if (!analyticsEnabled || location.origin !== siteOrigin || !Number.isSafeInteger(counterId) || counterId <= 0) return;

  let tag;
  let active = false;

  function readChoice() {
    try {
      const choice = JSON.parse(localStorage.getItem(preferenceKey));
      return ["yes", "no"].includes(choice?.value) && Number.isFinite(choice.at) ? choice.value : null;
    } catch {
      return null;
    }
  }

  function saveChoice(value) {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({ value, at: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }

  function safeReferrer() {
    if (!document.referrer) return "";
    try {
      const referrer = new URL(document.referrer);
      if (["https:", "http:"].includes(referrer.protocol) && referrer.origin !== siteOrigin) {
        return referrer.origin + "/";
      }
      const path = referrer.pathname.replace(/index\.html$/, "");
      if (referrer.origin === siteOrigin && publicPages.has(path)) return siteOrigin + path;
    } catch { /* Do not forward an invalid referrer. */ }
    return siteOrigin + "/";
  }

  function startCounter() {
    if (tag || readChoice() !== "yes") return;

    const ym = function () { (ym.a ||= []).push(arguments); };
    ym.l = Date.now();
    window.ym = ym;
    const script = document.createElement("script");
    tag = script;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    script.addEventListener("load", () => {
      if (tag !== script || readChoice() !== "yes") return;
      window.ym(counterId, "init", {
        defer: true, webvisor: false, clickmap: false, trackLinks: false,
        trackHash: false, accurateTrackBounce: false, ecommerce: false,
        sendTitle: false, disableYtm: true
      });
      window.ym(counterId, "hit", siteOrigin + pagePath, { referer: safeReferrer() });
      active = true;
    }, { once: true });
    document.head.append(script);
  }

  function stopCounter(reload = true) {
    if (!tag) return;
    const wasActive = active;
    active = false;
    tag.remove();
    tag = null;
    try {
      if (wasActive) window.ym(counterId, "destruct");
    } catch {
      // Reload below to discard the analytics runtime even if it failed to stop.
    } finally {
      if (reload) location.reload();
    }
  }

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "analytics-settings";
  settings.textContent = "Настройки аналитики";
  settings.setAttribute("aria-controls", "analytics-notice");
  settings.setAttribute("aria-expanded", "false");
  links.append(settings);

  const notice = document.createElement("section");
  notice.id = "analytics-notice";
  notice.className = "analytics-notice";
  notice.hidden = true;
  notice.setAttribute("aria-labelledby", "analytics-heading");
  notice.innerHTML = `
    <h2 id="analytics-heading" tabindex="-1">Аналитика сайта</h2>
    <p>С вашего согласия Яндекс Метрика использует cookies и данные о посещении для статистики. Выбор можно изменить в подвале сайта.</p>
    <p><a href="/privacy/#analytics-consent">Условия согласия</a></p>
    <div class="analytics-actions">
      <button type="button" data-choice="no">Отклонить</button>
      <button type="button" data-choice="yes">Разрешить</button>
    </div>
    <p role="status"></p>`;
  document.body.append(notice);
  const status = notice.querySelector('[role="status"]');

  function showNotice(show) {
    notice.hidden = !show;
    settings.setAttribute("aria-expanded", String(show));
  }

  settings.addEventListener("click", () => {
    const opening = notice.hidden;
    showNotice(opening);
    if (opening) notice.querySelector("h2").focus();
  });
  notice.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    showNotice(false);
    settings.focus();
  });
  notice.addEventListener("click", event => {
    const choice = event.target.closest("[data-choice]")?.dataset.choice;
    if (!choice) return;
    if (!saveChoice(choice)) {
      if (choice === "no") stopCounter(false);
      status.textContent = "Браузер не сохранил выбор. Проверьте настройки хранения данных.";
      return;
    }
    const restoreFocus = notice.contains(document.activeElement);
    showNotice(false);
    status.textContent = "";
    if (restoreFocus) settings.focus({ preventScroll: true });
    if (choice === "yes") startCounter();
    else stopCounter();
  });

  function syncChoice() {
    const choice = readChoice();
    if (choice === "yes") startCounter();
    else stopCounter();
    showNotice(choice === null);
  }

  window.addEventListener("storage", event => {
    if (event.key === preferenceKey || event.key === null) syncChoice();
  });
  window.addEventListener("pageshow", event => {
    if (event.persisted) syncChoice();
  });
  document.addEventListener("click", event => {
    if (!active || readChoice() !== "yes") return;
    const link = event.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    let name;
    if (pagePath === "/start/" && link.dataset.analyticsGoal === "enrollment_interest") {
      name = "enrollment_interest";
    } else if (pagePath === "/start/" && link.dataset.analyticsGoal === "training_schedule_open") {
      name = "training_schedule_open";
    } else if (href.startsWith("tel:")) {
      name = "contact_phone";
    } else if (href.startsWith("mailto:")) {
      name = "contact_email";
    } else if (href === "/contacts/") {
      name = "contact_open";
    }
    if (name) window.ym(counterId, "reachGoal", name);
  });

  syncChoice();
})();
