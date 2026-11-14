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

  async function publicRead(week) {
    const config = window.SUPABASE_CONFIG;
    async function read(table, extra = {}) {
      const url = new URL("/rest/v1/" + table, config.url);
      url.search = new URLSearchParams({ select: columns[table], ...extra });
      const response = await fetch(url, { headers: { apikey: config.anonKey }, cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Получен некорректный ответ.");
      return rows;
    }
    const [slots, changes] = await Promise.all([
      read("training_slots"),
      read("training_exceptions", { or: "(" + rangeFilter(week) + ")" })
    ]);
    return { slots, changes };
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
  const list = root.querySelector("[data-training-list]");
  const status = root.querySelector("[data-training-status]");
  let request = 0;
  const refresh = bindWeek(root, async (week) => {
    const token = ++request;
    status.textContent = "Загружаем расписание…";
    list.replaceChildren();
    try {
      const { slots, changes } = await publicRead(week);
      if (token !== request) return;
      showWeek(list, week, slots, changes);
      status.textContent = "";
    } catch {
      if (token !== request) return;
      showWeek(list, week, regularSlots, []);
      status.textContent = "Показано регулярное расписание. Сведения об отменах и переносах сейчас недоступны.";
    }
  });
  refresh();
})();
