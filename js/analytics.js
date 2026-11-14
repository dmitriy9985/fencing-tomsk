(function () {
  "use strict";

  const counterId = null; // Указать реальный номер после согласования публикации.
  if (!Number.isSafeInteger(counterId) || counterId <= 0 || location.origin !== "https://fencing-tomsk.ru") return;

  const preferenceKey = "ffto-analytics-v1";
  let active = false;
  function readChoice() {
    try { return localStorage.getItem(preferenceKey); } catch { return null; }
  }
  function saveChoice(choice) {
    try {
      localStorage.setItem(preferenceKey, choice);
      return true;
    } catch { return false; }
  }

  function startCounter() {
    if (active) return;
    active = true;
    window.ym = function () { (window.ym.a ||= []).push(arguments); };
    window.ym.l = Date.now();
    const tag = document.createElement("script");
    tag.async = true;
    tag.referrerPolicy = "no-referrer";
    tag.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.append(tag);
    window.ym(counterId, "init", {
      defer: true, webvisor: false, clickmap: false, trackLinks: false,
      accurateTrackBounce: false, disableYtm: true
    });
    window.ym(counterId, "hit", location.origin + location.pathname, {
      title: document.title, referer: ""
    });
  }

  function goal(name) {
    if (active) window.ym(counterId, "reachGoal", name);
  }

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "analytics-settings";
  settings.textContent = "Настройки аналитики";
  document.querySelector(".footer-bottom")?.append(settings);

  const dialog = document.createElement("dialog");
  dialog.className = "analytics-dialog";
  dialog.setAttribute("aria-labelledby", "analytics-heading");
  dialog.innerHTML = `
    <h2 id="analytics-heading">Аналитика сайта</h2>
    <p>С вашего согласия мы используем Яндекс Метрику, чтобы узнать, какие разделы посещают и как часто переходят к контактам. Метрика использует cookies. Выбор можно изменить внизу страницы.</p>
    <p><a href="/privacy/">Политика обработки персональных данных</a></p>
    <div class="analytics-actions">
      <button type="button" data-choice="no">Отклонить</button>
      <button type="button" data-choice="yes">Разрешить аналитику</button>
    </div>
    <p role="status"></p>`;
  document.body.append(dialog);
  settings.addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-choice]")?.dataset.choice;
    if (!choice) return;
    if (!saveChoice(choice)) {
      dialog.querySelector('[role="status"]').textContent = "Браузер не сохранил выбор. Настройка не изменилась.";
      return;
    }
    dialog.close();
    if (choice === "yes") startCounter();
    else if (active) {
      active = false;
      window.ym(counterId, "destruct");
      location.reload();
    }
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    if (href.startsWith("tel:")) goal("contact_phone");
    else if (href.startsWith("mailto:")) goal("contact_email");
    else if (href === "/contacts/") goal("contact_open");
    else if (href === "/calendar/") goal("calendar_open");
    else if (href === "#training-schedule") goal("training_schedule_open");
  });

  if (readChoice() === "yes") startCounter();
  else if (readChoice() !== "no") dialog.showModal();
})();
