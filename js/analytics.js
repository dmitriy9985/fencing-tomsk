(function () {
  "use strict";

  const counterId = 114258187;
  const analyticsEnabled = false; // Включать после утверждения документов и разрешения на публикацию.
  const preferenceKey = "ffto-analytics-v4";
  const messengerSources = new Set(["telegram", "whatsapp", "viber", "skype", "wechat"]);
  const siteOrigin = "https://fencing-tomsk.ru";
  const publicPages = new Set([
    "/", "/start/", "/training/", "/news/", "/calendar/", "/results/",
    "/calendar/event/", "/coaches/", "/organizations/", "/gallery/", "/contacts/",
    "/equipment/", "/support/", "/privacy/", "/privacy/analytics-consent/"
  ]);
  const pagePath = location.pathname.replace(/index\.html$/, "");
  if (!analyticsEnabled || location.origin !== siteOrigin || !publicPages.has(pagePath)) return;

  const disableFlag = "disableYaCounter" + counterId;
  window[disableFlag] = true;

  const footer = document.querySelector(".footer-bottom");
  const links = document.createElement("div");
  links.className = "footer-analytics";
  links.innerHTML = '<a class="footer-privacy" href="/privacy/">Конфиденциальность</a>';
  footer?.append(links);

  let tag;
  let active = false;
  let consentUncertain = false;

  function readChoice() {
    if (consentUncertain) return null;
    try {
      const saved = localStorage.getItem(preferenceKey);
      const choice = JSON.parse(saved);
      if (!Number.isFinite(choice?.at)) return null;
      if (choice.value === "no") return "no";
      if (choice.value === "yes" && sessionStorage.getItem(preferenceKey) === saved) return "yes";
    } catch {
      return null;
    }
    return null;
  }

  function saveChoice(value) {
    consentUncertain = true;
    // Invalidate both copies before writing the new choice. A failed write of
    // the refusal must not leave a previous grant usable after navigation.
    try { sessionStorage.removeItem(preferenceKey); } catch { /* Try local storage independently. */ }
    try { localStorage.removeItem(preferenceKey); } catch { /* The matching tab grant may already be gone. */ }

    try {
      const choice = JSON.stringify({ value, at: Date.now() });
      if (value === "yes") {
        sessionStorage.setItem(preferenceKey, choice);
        if (sessionStorage.getItem(preferenceKey) !== choice) return false;
      }
      localStorage.setItem(preferenceKey, choice);
      if (localStorage.getItem(preferenceKey) !== choice) return false;
    } catch {
      return false;
    }
    consentUncertain = false;
    return true;
  }

  function pageAllowsAnalytics() {
    const query = new URLSearchParams(location.search);
    const seen = new Set();
    for (const [name, value] of query) {
      if (seen.has(name)) return false;
      seen.add(name);
      if (name === "id" && ["/news/", "/calendar/event/"].includes(pagePath) && /^[1-9]\d{0,9}$/.test(value)) continue;
      if (name === "utm_medium" && value === "messenger" && messengerSources.has(query.get("utm_source"))) continue;
      if (name === "utm_source" && messengerSources.has(value) && query.get("utm_medium") === "messenger") continue;
      return false;
    }

    // The vendor tag can also use the current URL for its own requests.
    // Only allow fragments that identify an existing public page anchor.
    const fragment = location.hash.slice(1);
    return !fragment || (/^[a-z][a-z0-9-]{0,79}$/.test(fragment) && !!document.getElementById(fragment));
  }

  function pageUrlForAnalytics() {
    const url = new URL(pagePath, siteOrigin);
    const query = new URLSearchParams(location.search);
    const source = query.get("utm_source");
    if (query.get("utm_medium") === "messenger" && messengerSources.has(source)) {
      url.searchParams.set("utm_medium", "messenger");
      url.searchParams.set("utm_source", source);
    }
    return url.href;
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
    if (tag || readChoice() !== "yes" || !pageAllowsAnalytics()) return;

    const ym = function () { (ym.a ||= []).push(arguments); };
    ym.l = Date.now();
    window.ym = ym;
    const script = document.createElement("script");
    tag = script;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    script.addEventListener("load", () => {
      if (tag !== script || readChoice() !== "yes" || !pageAllowsAnalytics()) return;
      window[disableFlag] = false;
      window.ym(counterId, "init", {
        defer: true, webvisor: false, clickmap: false, trackLinks: false,
        trackHash: false, accurateTrackBounce: false, ecommerce: false,
        sendTitle: false, disableYtm: true
      });
      window.ym(counterId, "hit", pageUrlForAnalytics(), { referer: safeReferrer() });
      active = true;
    }, { once: true });
    document.head.append(script);
  }

  function stopCounter(reload = true) {
    window[disableFlag] = true;
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
    <p>Яндекс Метрика собирает статистику посещений с вашего согласия. <a href="/privacy/analytics-consent/">Условия согласия</a>.</p>
    <div class="analytics-actions">
      <button type="button" data-choice="no">Отклонить</button>
      <button type="button" data-choice="yes">Разрешить аналитику</button>
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
      stopCounter(false);
      status.textContent = "Аналитика отключена. Если браузер не сохраняет выбор, очистите данные этого сайта в настройках браузера.";
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
    if (choice === "yes" && pageAllowsAnalytics()) startCounter();
    else stopCounter(choice === "no");
    showNotice(choice === null && !pagePath.startsWith("/privacy/"));
  }

  window.addEventListener("storage", event => {
    if (event.key === preferenceKey || event.key === null) syncChoice();
  });
  window.addEventListener("hashchange", syncChoice);
  window.addEventListener("pageshow", event => {
    if (event.persisted) syncChoice();
  });
  document.addEventListener("click", event => {
    if (!active || readChoice() !== "yes" || !pageAllowsAnalytics()) return;
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
