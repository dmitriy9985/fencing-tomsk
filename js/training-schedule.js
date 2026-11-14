(() => {
  "use strict";

  const zone = "Asia/Tomsk";
  const timestamp = (day, time) => Date.parse(day + "T" + time + ":00+07:00");
  const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: zone });
  const labelFormat = new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone, weekday: "long", day: "numeric", month: "long"
  });
  const today = () => dayFormat.format(new Date());
  const dayLabel = (day) => labelFormat.format(timestamp(day, "12:00"));
  const addDays = (day, count) => new Date(Date.parse(day + "T12:00:00Z") + count * 86400000).toISOString().slice(0, 10);
  const dayOfWeek = (day) => new Date(day + "T12:00:00Z").getUTCDay() || 7;
  const weekStart = (day) => addDays(day, 1 - dayOfWeek(day));
  const weekFormat = new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone, day: "numeric", month: "long", year: "numeric"
  });
  const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(timestamp(day, "12:00"))
    && dayFormat.format(timestamp(day, "12:00")) === day;
  const validTime = (time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const weekdays = [1, 2, 3, 4, 5];
  // Approved regular hours shown with a warning while live updates are unavailable.
  const regularSlots = [
    { id: "morning-1", weekdays, starts_at: "08:00", ends_at: "09:15" },
    { id: "morning-2", weekdays, starts_at: "09:00", ends_at: "10:30" },
    { id: "afternoon", weekdays, starts_at: "15:00", ends_at: "16:30" },
    { id: "monday-evening", weekdays: [1], starts_at: "16:30", ends_at: "18:30" },
    { id: "evening", weekdays: [2, 3, 4, 5], starts_at: "17:00", ends_at: "19:00" }
  ];
  const columns = {
    training_slots: "id,weekdays,starts_at,ends_at",
    training_exceptions: "slot_id,original_date,status,moved_date,moved_time,reason,revision"
  };

  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  function occurrence(slot, day, change) {
    const start = slot.starts_at.slice(0, 5);
    return {
      slot, day, start, end: slot.ends_at.slice(0, 5),
      date: change?.moved_date || day, time: change?.moved_time?.slice(0, 5) || start,
      status: change?.status || "regular", revision: change?.revision || 0, reason: change?.reason || ""
    };
  }

  function timeRange(lesson) {
    const duration = timestamp(lesson.day, lesson.end) - timestamp(lesson.day, lesson.start);
    const end = timestamp(lesson.date, lesson.time) + duration;
    const endTime = new Intl.DateTimeFormat("ru-RU", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(end);
    return lesson.time + "–" + endTime + (dayFormat.format(end) !== lesson.date ? " (+1 день)" : "");
  }

  function occurrences(slots, changes, day) {
    const items = [];
    for (const slot of slots) {
      const matching = changes.filter(change => change.slot_id === slot.id);
      if (slot.weekdays.includes(dayOfWeek(day))) {
        items.push(occurrence(slot, day, matching.find(change => change.original_date === day)));
      }
      for (const change of matching) {
        if (change.moved_date === day && change.original_date !== day) {
          items.push(occurrence(slot, change.original_date, change));
        }
      }
    }
    return items.sort((left, right) => (left.day === day ? left.start : left.time)
      .localeCompare(right.day === day ? right.start : right.time));
  }

  function showWeek(list, week, slots, changes, addActions) {
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(week, index);
      const card = element("section", "", "training-day");
      card.append(element("h3", dayLabel(day)));
      if (index === 5) card.append(element("p", "Выходной по расписанию.", "training-day-note"));
      if (index === 6) card.append(element("p", "Боевая практика. Время уточняется отдельно.", "training-day-note"));
      for (const lesson of occurrences(slots, changes, day)) {
        const row = element("div", "", "training-entry");
        const wasRescheduled = lesson.date !== lesson.day || lesson.time !== lesson.start;
        const label = {
          regular: "",
          cancelled: wasRescheduled ? "Отменена после переноса" : "Отменена",
          moved: "Перенесена"
        }[lesson.status];
        row.append(element("strong", lesson.date === day ? timeRange(lesson) : lesson.start + "–" + lesson.end));
        if (label) row.append(element("span", label, "training-state training-state-" + lesson.status));
        if (wasRescheduled) {
          const cancelled = lesson.status === "cancelled";
          row.append(element("p", (cancelled ? "Изначально: " : "Было: ") + dayLabel(lesson.day) + ", " + lesson.start + "–" + lesson.end));
          row.append(element("p", (cancelled ? "Отменено: " : "Стало: ") + dayLabel(lesson.date) + ", " + timeRange(lesson)));
        }
        if (lesson.reason) row.append(element("p", lesson.reason));
        if (addActions && lesson.day === day && timestamp(lesson.date, lesson.time) > Date.now()) addActions(row, lesson);
        card.append(row);
      }
      return card;
    });
    list.replaceChildren(...days);
  }

  function rangeFilter(week) {
    const end = addDays(week, 6);
    return "and(original_date.gte." + week + ",original_date.lte." + end + "),"
      + "and(moved_date.gte." + week + ",moved_date.lte." + end + ")";
  }

  async function publicRead(table, extra = {}) {
    const config = window.SUPABASE_CONFIG;
    const url = new URL("/rest/v1/" + table, config.url);
    url.search = new URLSearchParams({ select: columns[table], ...extra });
    const response = await fetch(url, { headers: { apikey: config.anonKey }, cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Получен некорректный ответ.");
    return rows;
  }

  function bindWeek(root, loadWeek) {
    const picker = root.querySelector("[data-training-date]");
    const range = root.querySelector("[data-training-week-range]");
    const requestedDay = new URLSearchParams(location.search).get("date");
    picker.value = validDay(requestedDay) ? requestedDay : today();
    const update = () => {
      if (!validDay(picker.value)) return;
      const week = weekStart(picker.value);
      if (range) {
        range.textContent = weekFormat.formatRange(timestamp(week, "12:00"), timestamp(addDays(week, 6), "12:00"));
      }
      loadWeek(week);
    };
    const selectWeek = () => {
      if (!validDay(picker.value)) return;
      const url = new URL(location.href);
      url.searchParams.set("date", picker.value);
      history.replaceState(history.state, "", url);
      update();
    };
    picker.addEventListener("change", selectWeek);
    root.querySelector("[data-training-today]")?.addEventListener("click", () => {
      picker.value = today();
      selectWeek();
    });
    for (const button of root.querySelectorAll("[data-training-step]")) {
      button.addEventListener("click", () => {
        picker.value = addDays(validDay(picker.value) ? picker.value : today(), Number(button.dataset.trainingStep));
        selectWeek();
      });
    }
    return update;
  }

  window.FFTOTraining = { regularSlots, columns, today, dayLabel, addDays, timestamp, validDay, validTime,
    showWeek, element, timeRange, rangeFilter, bindWeek };

  const root = document.querySelector("[data-training-public]");
  if (!root) return;
  const regular = root.querySelector("[data-training-regular]");
  const regularStatus = root.querySelector("[data-training-regular-status]");
  const list = root.querySelector("[data-training-list]");
  const status = root.querySelector("[data-training-status]");
  const weekAlert = document.querySelector("[data-training-week-alert]");
  const alertSummary = weekAlert.querySelector("[data-training-alert-summary]");
  const periods = {
    "morning-1": "Утро", "morning-2": "Утро", afternoon: "День",
    "monday-evening": "Вечер", evening: "Вечер"
  };
  const shortDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  function showRegular(slots) {
    const groups = new Map();
    const ordered = [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    for (const slot of ordered) {
      const days = [...slot.weekdays].sort((a, b) => a - b);
      const key = days.join(",");
      const label = { "1,2,3,4,5": "Пн–пт", "2,3,4,5": "Вт–пт", 1: "Понедельник" }[key]
        || days.map(day => shortDays[day - 1]).join(", ");
      const period = periods[slot.id];
      const groupKey = (period || "") + ":" + key;
      if (!groups.has(groupKey)) groups.set(groupKey, { title: period || label, days: period ? label : "", times: [] });
      groups.get(groupKey).times.push(slot.starts_at.slice(0, 5) + "–" + slot.ends_at.slice(0, 5));
    }

    const rows = [];
    for (const group of groups.values()) {
      const row = element("div", "", "training-regular-row");
      const term = element("dt", group.title);
      if (group.days) term.append(element("span", group.days, "training-regular-days"));
      const hours = element("dd", "", "training-regular-hours");
      for (const time of group.times) hours.append(element("span", time));
      row.append(term, hours);
      rows.push(row);
    }
    for (const [day, note, detail] of [
      ["Суббота", "Выходной"],
      ["Воскресенье", "Боевая практика", "Время уточняется"]
    ]) {
      const row = element("div", "", "training-regular-row training-weekend");
      const description = element("dd", note);
      if (detail) description.append(element("span", detail));
      row.append(element("dt", day), description);
      rows.push(row);
    }
    regular.replaceChildren(...rows);
  }

  function showChanges(week, slots, changes) {
    const end = addDays(week, 6);
    const byId = new Map(slots.map(slot => [slot.id, slot]));
    const lessons = [];
    for (const change of changes) {
      const slot = byId.get(change.slot_id);
      if (!slot || !["cancelled", "moved"].includes(change.status)) continue;
      const lesson = occurrence(slot, change.original_date, change);
      const originalInWeek = lesson.day >= week && lesson.day <= end;
      lessons.push({ lesson, sortTime: originalInWeek ? lesson.day + lesson.start : lesson.date + lesson.time });
    }
    lessons.sort((a, b) => a.sortTime.localeCompare(b.sortTime));

    let cancellations = 0;
    for (const { lesson } of lessons) {
      const cancelled = lesson.status === "cancelled";
      if (cancelled) cancellations++;
      const rescheduled = lesson.date !== lesson.day || lesson.time !== lesson.start;
      const card = element("li", "", "training-change training-change-" + lesson.status);
      const label = cancelled ? (rescheduled ? "Отменена после переноса" : "Отменена") : "Перенесена";
      card.append(element("strong", label, "training-change-label"));
      const times = element("dl", "", "training-change-times");
      const addTime = (title, day, time) => {
        const row = element("div");
        row.append(element("dt", title), element("dd", dayLabel(day) + ", " + time));
        times.append(row);
      };
      addTime(rescheduled ? (cancelled ? "Изначально" : "Было") : "По расписанию",
        lesson.day, lesson.start + "–" + lesson.end);
      if (rescheduled) addTime(cancelled ? "Отменено" : "Стало", lesson.date, timeRange(lesson));
      card.append(times);
      if (lesson.reason) card.append(element("p", "Причина: " + lesson.reason, "training-change-reason"));
      list.append(card);
    }
    status.textContent = lessons.length ? "" : "На этой неделе изменений нет.";
    if (lessons.length && week === weekStart(today())) {
      const moves = lessons.length - cancellations;
      alertSummary.textContent = [
        cancellations ? "Отменено: " + cancellations : "",
        moves ? "Перенесено: " + moves : ""
      ].filter(Boolean).join(" · ");
      weekAlert.hidden = false;
    }
  }

  let request = 0;
  let slotsRequest;
  const refresh = bindWeek(root, async (week) => {
    const token = ++request;
    weekAlert.hidden = true;
    status.textContent = "Загружаем изменения…";
    list.replaceChildren();
    slotsRequest ||= publicRead("training_slots").then(slots => {
      showRegular(slots);
      regularStatus.textContent = "";
      return slots;
    }).catch(error => {
      slotsRequest = null;
      showRegular(regularSlots);
      regularStatus.textContent = "Показано сохранённое расписание. Обновление временно недоступно.";
      throw error;
    });
    try {
      const [slots, changes] = await Promise.all([
        slotsRequest,
        publicRead("training_exceptions", { or: "(" + rangeFilter(week) + ")" })
      ]);
      if (token !== request) return;
      showChanges(week, slots, changes);
    } catch {
      if (token !== request) return;
      status.textContent = "Не удалось загрузить изменения. Обновите страницу или выберите неделю ещё раз.";
    }
  });
  refresh();
})();
