(() => {
  "use strict";

  const api = window.SiteAdmin;
  const schedule = window.FFTOTraining;
  const root = document.querySelector('[data-admin-section="training"]');
  if (!root) return;

  const list = root.querySelector("[data-training-list]");
  const status = root.querySelector("[data-training-status]");
  const dialog = root.querySelector("#training-dialog");
  const form = root.querySelector("#training-form");
  const moveFields = root.querySelector("#training-move-fields");
  const reasonLabel = root.querySelector("#training-reason");
  const submit = root.querySelector("#training-submit");
  const error = root.querySelector("#training-error");
  const notice = root.querySelector("#training-notice");
  const dateInput = form.elements.date;
  const timeInput = form.elements.time;
  const reasonInput = form.elements.reason;
  const actions = {
    cancelled: ["Отменить тренировку", "Подтвердить отмену"],
    moved: ["Перенести тренировку", "Подтвердить перенос"],
    regular: ["Вернуть по расписанию", "Подтвердить возврат"]
  };
  let request = 0;
  let busy = false;
  let selected;
  let action;
  let trigger;

  const refresh = schedule.bindWeek(root, loadWeek);
  api.registerSection("training", {
    activate: refresh,
    discardChanges: close,
    reset() {
      request++;
      close();
      notice.hidden = true;
      list.replaceChildren();
      status.textContent = "";
    }
  });
  root.querySelector("#training-refresh").addEventListener("click", refresh);

  async function loadWeek(week) {
    const client = api.getClient();
    if (!client || !api.getUser()) return;
    const token = ++request;
    list.replaceChildren();
    status.textContent = "Загружаем расписание…";
    try {
      const [slots, changes] = await Promise.all([
        client.from("training_slots").select(schedule.columns.training_slots),
        client.from("training_exceptions").select(schedule.columns.training_exceptions).or(schedule.rangeFilter(week))
      ]);
      if (token !== request) return;
      if (slots.error || changes.error) throw slots.error || changes.error;
      schedule.showWeek(list, week, slots.data, changes.data, addActions);
      status.textContent = "";
    } catch {
      if (token !== request) return;
      status.textContent = "Не удалось загрузить расписание. Проверьте подключение и наличие миграции тренировок.";
    }
  }

  function addActions(row, lesson) {
    const group = schedule.element("div", "", "training-actions");
    const types = lesson.status === "regular" ? ["cancelled", "moved"]
      : lesson.status === "moved" ? ["cancelled", "moved", "regular"] : ["moved", "regular"];
    for (const type of types) {
      const label = type === "moved" ? (lesson.status === "moved" ? "Изменить перенос" : "Перенести")
        : type === "cancelled" ? "Отменить" : actions[type][0];
      const button = schedule.element("button", label, "button button-secondary button-small");
      button.type = "button";
      button.addEventListener("click", () => open(lesson, type, button));
      group.append(button);
    }
    row.append(group);
  }

  function open(lesson, type, button) {
    selected = lesson;
    action = type;
    trigger = button;
    form.reset();
    error.textContent = "";
    root.querySelector("#training-dialog-title").textContent = actions[type][0];
    root.querySelector("#training-original").textContent = "Исходное занятие: " + schedule.dayLabel(lesson.day) + ", " + lesson.start + "–" + lesson.end;
    const state = { regular: "По расписанию", cancelled: "Отменена", moved: "Перенесена" }[lesson.status];
    root.querySelector("#training-current").textContent = "Статус: " + state + (lesson.status === "moved"
      ? " · " + schedule.dayLabel(lesson.date) + ", " + schedule.timeRange(lesson) : "");
    submit.textContent = actions[type][1];
    moveFields.hidden = type !== "moved";
    dateInput.disabled = timeInput.disabled = type !== "moved";
    reasonLabel.hidden = type === "regular";
    dateInput.min = schedule.today();
    dateInput.value = lesson.date;
    timeInput.value = lesson.time;
    reasonInput.value = type === "moved" && lesson.status === "moved" ? lesson.reason : "";
    dialog.querySelector(".training-copy-status").textContent = "";
    updatePreview();
    dialog.showModal();
  }

  function close() {
    if (dialog.open && !busy) dialog.close();
  }

  function draft() {
    return {
      date: action === "moved" ? dateInput.value : selected.date,
      time: action === "moved" ? timeInput.value : selected.time,
      reason: action === "regular" ? "" : reasonInput.value.trim()
    };
  }

  function updatePreview() {
    const change = draft();
    const valid = schedule.validDay(change.date) && schedule.validTime(change.time);
    const preview = dialog.querySelector(".training-message");
    dialog.querySelector("[data-copy]").disabled = !valid;
    if (!valid) {
      preview.textContent = "Укажите новую дату и время.";
      return;
    }
    const before = schedule.dayLabel(selected.date) + ", " + schedule.timeRange(selected);
    const original = schedule.dayLabel(selected.day) + ", " + selected.start + "–" + selected.end;
    let lines;
    if (action === "moved") {
      const next = { ...selected, date: change.date, time: change.time };
      lines = ["🔄 Тренировка перенесена", "Было: " + before, "Стало: " + schedule.dayLabel(next.date) + ", " + schedule.timeRange(next)];
    } else if (action === "cancelled") {
      lines = ["❌ Тренировка отменена", "Занятие: " + before];
    } else {
      lines = ["↩️ Тренировка снова по расписанию", "По расписанию: " + original];
    }
    if (change.reason) lines.push("Причина: " + change.reason);
    lines.push("Расписание: https://fencing-tomsk.ru/training/");
    preview.textContent = lines.join("\n");
  }

  form.addEventListener("input", () => {
    error.textContent = "";
    updatePreview();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const client = api.getClient();
    if (!client || !api.getUser() || busy || !dialog.open) return;
    const change = draft();
    if (action === "moved" && (!schedule.validDay(change.date) || !schedule.validTime(change.time)
      || schedule.timestamp(change.date, change.time) <= Date.now())) {
      error.textContent = "Укажите корректные дату и время в будущем.";
      return;
    }
    const message = dialog.querySelector(".training-message").textContent;
    busy = submit.disabled = true;
    dateInput.disabled = timeInput.disabled = reasonInput.disabled = true;
    api.setSectionBusy("training", true);
    error.textContent = "";
    try {
      const result = await client.rpc("change_training", {
        p_slot_id: selected.slot.id,
        p_original_date: selected.day,
        p_status: action,
        p_revision: selected.revision,
        p_moved_date: action === "moved" ? change.date : null,
        p_moved_time: action === "moved" ? change.time + ":00" : null,
        p_reason: change.reason || null
      });
      if (result.error) throw result.error;
      notice.querySelector(".training-message").textContent = message;
      notice.querySelector(".training-copy-status").textContent = "";
      notice.hidden = false;
      dialog.close();
      refresh();
      root.querySelector("[data-training-date]").focus();
    } catch (failure) {
      error.textContent = ["22023", "40001", "42501"].includes(failure.code)
        ? failure.message : "Не удалось подтвердить сохранение. Обновите список перед повторной попыткой.";
    } finally {
      busy = submit.disabled = reasonInput.disabled = false;
      dateInput.disabled = timeInput.disabled = action !== "moved";
      api.setSectionBusy("training", false);
    }
  });
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { if (trigger?.isConnected) trigger.focus(); });
  form.querySelector("[data-close]").addEventListener("click", close);

  for (const container of [dialog, notice]) {
    container.querySelector("[data-copy]").addEventListener("click", async () => {
      const message = container.querySelector(".training-message");
      const feedback = container.querySelector(".training-copy-status");
      try {
        await navigator.clipboard.writeText(message.textContent);
        feedback.textContent = "Текст скопирован.";
      } catch {
        const range = document.createRange();
        range.selectNodeContents(message);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        feedback.textContent = "Текст выделен. Нажмите «Копировать».";
      }
    });
  }
})();
