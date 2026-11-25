(function () {
  "use strict";

  const sectionName = "calendar";
  const api = window.SiteAdmin;
  const MONTHS_NOMINATIVE = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  const MONTHS_GENITIVE = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];
  const elements = {
    add: document.getElementById("calendar-add-button"),
    editor: document.getElementById("calendar-editor"),
    editorTitle: document.getElementById("calendar-editor-title"),
    close: document.getElementById("calendar-close-button"),
    form: document.getElementById("calendar-form"),
    title: document.getElementById("calendar-title"),
    datePrecision: document.getElementById("calendar-date-precision"),
    exactDateFields: document.getElementById("calendar-exact-date-fields"),
    dateModeHint: document.getElementById("calendar-date-mode-hint"),
    monthDateFields: document.getElementById("calendar-month-date-fields"),
    startDate: document.getElementById("calendar-start-date"),
    endDate: document.getElementById("calendar-end-date"),
    dateMonth: document.getElementById("calendar-date-month"),
    dateYear: document.getElementById("calendar-date-year"),
    location: document.getElementById("calendar-location"),
    description: document.getElementById("calendar-description"),
    category: document.getElementById("calendar-category"),
    shortLabel: document.getElementById("calendar-short-label"),
    participantGroups: document.getElementById("calendar-participant-groups"),
    addGroup: document.getElementById("calendar-add-participant-group"),
    weapon: document.getElementById("calendar-weapon"),
    startTime: document.getElementById("calendar-start-time"),
    meetingTime: document.getElementById("calendar-meeting-time"),
    zone: document.getElementById("calendar-zone"),
    contact: document.getElementById("calendar-contact"),
    regulation: document.getElementById("calendar-regulation"),
    documentTitle: document.getElementById("calendar-document-title"),
    documentUrl: document.getElementById("calendar-document-url"),
    published: document.getElementById("calendar-published"),
    save: document.getElementById("calendar-save-button"),
    cancel: document.getElementById("calendar-cancel-button"),
    refresh: document.getElementById("calendar-refresh-button"),
    period: document.getElementById("calendar-period"),
    publication: document.getElementById("calendar-publication"),
    list: document.getElementById("calendar-list"),
    previewDate: document.getElementById("calendar-preview-date"),
    previewTitle: document.getElementById("calendar-preview-title"),
    previewLocation: document.getElementById("calendar-preview-location"),
    previewDescription: document.getElementById("calendar-preview-description"),
    previewCategory: document.getElementById("calendar-preview-category"),
    previewStatus: document.getElementById("calendar-preview-status")
  };

  let items = [];
  let editingItem = null;
  let loaded = false;
  let working = false;

  bindEvents();
  api.registerSection(sectionName, { activate, reset, discardChanges });

  function bindEvents() {
    elements.add.addEventListener("click", openCreateForm);
    elements.close.addEventListener("click", () => closeEditor(true));
    elements.cancel.addEventListener("click", () => closeEditor(true));
    elements.addGroup.addEventListener("click", () => {
      appendParticipantGroup().focus();
      api.setDirty(sectionName, true);
    });
    elements.form.addEventListener("submit", saveItem);
    elements.refresh.addEventListener("click", loadItems);
    elements.period.addEventListener("change", renderList);
    elements.publication.addEventListener("change", renderList);
    elements.datePrecision.addEventListener("change", () => {
      syncDateFields();
      if (!elements.editor.hidden) {
        api.setDirty(sectionName, true);
        updatePreview();
      }
    });
    elements.form.addEventListener("input", () => {
      if (!elements.editor.hidden) {
        api.setDirty(sectionName, true);
        updatePreview();
      }
    });
  }

  async function activate() {
    if (!loaded) {
      await loadItems();
    } else {
      renderList();
    }
  }

  async function loadItems() {
    const client = api.getClient();
    if (!client) {
      return;
    }
    elements.list.replaceChildren(api.createStateBlock("Загружаем события…", "loading-state"));
    elements.refresh.disabled = true;
    try {
      const { data, error } = await client
        .from("competition_events")
        .select("id,title,start_date,end_date,date_precision,date_month,date_year,sort_date,location,description,category_label,short_label,participant_groups,weapon_label,start_time,meeting_time,time_zone,organizer_contact,regulation_url,document_title,document_url,published,created_at,updated_at")
        .order("sort_date", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      items = Array.isArray(data) ? data : [];
      loaded = true;
      renderList();
    } catch (error) {
      elements.list.replaceChildren(api.createStateBlock("Не удалось загрузить календарь."));
      api.showMessage(api.readableError(error, "Не удалось загрузить календарь."), "error");
    } finally {
      elements.refresh.disabled = false;
    }
  }

  function renderList() {
    if (items.length === 0) {
      elements.list.replaceChildren(api.createStateBlock("Событий пока нет. Нажмите «Добавить событие»."));
      return;
    }
    const sorted = window.CalendarFilter.select(items, elements.period.value, elements.publication.value);
    if (sorted.length === 0) {
      elements.list.replaceChildren(api.createStateBlock("Событий по выбранным фильтрам нет."));
      return;
    }
    const fragment = document.createDocumentFragment();
    sorted.forEach((item) => fragment.append(createRow(item)));
    elements.list.replaceChildren(fragment);
  }

  function createRow(item) {
    const row = api.createElement("article", { className: "record-row" });
    const content = api.createElement("div", { className: "record-row-content" });
    const date = api.createElement("p", { className: "record-meta", text: formatEventDate(item) });
    const title = api.createElement("h3", { text: item.title });
    const details = api.createElement("p", {
      className: "record-summary",
      text: [item.location, item.category_label].filter(Boolean).join(" · ") || "Место и категория не указаны"
    });
    const status = createStatus(item.published);
    content.append(date, title, details, status);

    const actions = api.createElement("div", { className: "record-actions" });
    if (item.published) {
      const link = api.createElement("a", { text: "Карточка", className: "button button-secondary button-small" });
      link.href = "/calendar/event/?id=" + encodeURIComponent(item.id);
      link.target = "_blank";
      link.rel = "noopener";
      actions.append(link);
    }
    actions.append(
      createButton(item.published ? "В черновик" : "Опубликовать", "button button-secondary button-small", () => togglePublished(item)),
      createButton("Изменить", "button button-secondary button-small", () => openEditForm(item)),
      createButton("Удалить", "button button-danger button-small", () => deleteItem(item))
    );
    row.append(content, actions);
    return row;
  }

  function openCreateForm() {
    if (!prepareForAnotherForm()) {
      return;
    }
    editingItem = null;
    elements.form.reset();
    elements.datePrecision.value = "exact";
    showParticipantGroups([]);
    const today = window.CalendarFilter.today();
    elements.startDate.value = today;
    elements.dateYear.value = today.slice(0, 4);
    elements.editorTitle.textContent = "Новое событие";
    elements.editor.hidden = false;
    api.setDirty(sectionName, false);
    syncDateFields();
    updatePreview();
    focusEditor();
  }

  function openEditForm(item) {
    if (!prepareForAnotherForm()) {
      return;
    }
    editingItem = item;
    elements.form.reset();
    elements.title.value = item.title || "";
    elements.datePrecision.value = normalizePrecision(item.date_precision);
    elements.startDate.value = item.start_date || "";
    elements.endDate.value = item.end_date || "";
    elements.dateMonth.value = item.date_month ? String(item.date_month) : "";
    elements.dateYear.value = item.date_year ? String(item.date_year) : "";
    elements.location.value = item.location || "";
    elements.description.value = item.description || "";
    elements.category.value = item.category_label || "";
    elements.shortLabel.value = item.short_label || "";
    elements.weapon.value = item.weapon_label || "";
    showParticipantGroups(item.participant_groups);
    elements.startTime.value = (item.start_time || "").slice(0, 5);
    elements.meetingTime.value = (item.meeting_time || "").slice(0, 5);
    elements.zone.value = item.time_zone || "";
    elements.contact.value = item.organizer_contact || "";
    elements.regulation.value = item.regulation_url || "";
    elements.documentTitle.value = item.document_title || "";
    elements.documentUrl.value = item.document_url || "";
    elements.published.checked = Boolean(item.published);
    elements.editorTitle.textContent = "Изменение события";
    elements.editor.hidden = false;
    api.setDirty(sectionName, false);
    syncDateFields();
    updatePreview();
    focusEditor();
  }

  function showParticipantGroups(groups) {
    elements.participantGroups.replaceChildren();
    if (groups?.length) groups.forEach(appendParticipantGroup);
    else appendParticipantGroup();
  }

  function appendParticipantGroup(group = {}) {
    const row = api.createElement("div", { className: "calendar-participant-group" });
    function field(label, value, maxLength, placeholder) {
      const wrapper = api.createElement("label", { text: label });
      const input = document.createElement("input");
      input.type = "text";
      input.value = value || "";
      input.maxLength = maxLength;
      input.placeholder = placeholder;
      wrapper.append(input);
      row.append(wrapper);
      return input;
    }
    const category = field("Возрастная категория", group.label, 64, "Юниоры и юниорки");
    field("Годы рождения", group.birth_years, 48, "2007–2013");
    row.append(createButton("Убрать группу", "button button-secondary button-small", () => {
      row.remove();
      elements.addGroup.focus();
      api.setDirty(sectionName, true);
    }));
    elements.participantGroups.append(row);
    return category;
  }

  function prepareForAnotherForm() {
    if (!elements.editor.hidden && !api.confirmDiscard(sectionName)) {
      return false;
    }
    return true;
  }

  function focusEditor() {
    elements.title.focus({ preventScroll: true });
    elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeEditor(ask) {
    if (ask && !api.confirmDiscard(sectionName)) {
      return;
    }
    discardChanges();
  }

  function discardChanges() {
    editingItem = null;
    elements.editor.hidden = true;
    elements.form.reset();
    elements.participantGroups.replaceChildren();
    api.setDirty(sectionName, false);
  }

  function updatePreview() {
    const dateLabel = formatEventDate(readFormDateState());
    elements.previewDate.textContent = dateLabel || "Дата события";
    elements.previewTitle.textContent = elements.title.value.trim() || "Название события";
    elements.previewLocation.textContent = elements.location.value.trim() || "Место проведения";
    elements.previewDescription.textContent = elements.description.value.trim() || "Описание события появится здесь.";
    elements.previewCategory.textContent = elements.category.value.trim();
    elements.previewCategory.hidden = !elements.previewCategory.textContent;
    setStatus(elements.previewStatus, elements.published.checked);
  }

  async function saveItem(event) {
    event.preventDefault();
    syncDateFields();
    if (working || !elements.form.reportValidity()) {
      return;
    }
    if (!elements.title.value.trim()) {
      elements.title.setCustomValidity("Укажите название события.");
      elements.title.reportValidity();
      elements.title.setCustomValidity("");
      return;
    }
    const datePrecision = normalizePrecision(elements.datePrecision.value);
    if (datePrecision !== "month" && elements.endDate.value && elements.endDate.value < elements.startDate.value) {
      elements.endDate.setCustomValidity("Дата окончания не может быть раньше даты начала.");
      elements.endDate.reportValidity();
      elements.endDate.setCustomValidity("");
      return;
    }

    const hasTime = Boolean(elements.startTime.value || elements.meetingTime.value);
    const zone = elements.zone.value.trim();
    if (hasTime) {
      try {
        if (!zone) throw new RangeError();
        new Intl.DateTimeFormat("ru", { timeZone: zone });
      } catch {
        return reportInvalid(elements.zone, "Укажите часовой пояс, например Asia/Tomsk.");
      }
    }
    const documentTitle = elements.documentTitle.value.trim();
    const documentUrl = elements.documentUrl.value.trim();
    if (Boolean(documentTitle) !== Boolean(documentUrl)) {
      return reportInvalid(documentTitle ? elements.documentUrl : elements.documentTitle,
        "Для дополнительного документа нужны и название, и ссылка.");
    }
    const participantGroups = [];
    for (const group of elements.participantGroups.children) {
      const [category, years] = group.querySelectorAll("input");
      const label = category.value.trim();
      const birthYears = years.value.trim().replace(/\s*[-–—]\s*/g, "–").replace(/\s*,\s*/g, ", ");
      if (birthYears && !/^(?:\d{4} и (?:младше|старше)|\d{4}(?:–\d{4})?(?:, \d{4}(?:–\d{4})?)*)$/.test(birthYears)) {
        return reportInvalid(years, "Укажите год, диапазон 2007–2013, список через запятую или, например, «2012 и младше».");
      }
      if (birthYears.split(", ").some(range => {
        const [from, to] = range.split("–");
        return to && from > to;
      })) {
        return reportInvalid(years, "Укажите годы в диапазоне от меньшего к большему.");
      }
      if (label || birthYears) {
        participantGroups.push({ ...(label && { label }), ...(birthYears && { birth_years: birthYears }) });
      }
    }
    const payload = {
      title: elements.title.value.trim(),
      date_precision: datePrecision,
      start_date: datePrecision === "month" ? null : elements.startDate.value,
      end_date: datePrecision === "month" ? null : (elements.endDate.value || null),
      date_month: datePrecision === "month" ? Number.parseInt(elements.dateMonth.value, 10) : null,
      date_year: datePrecision === "month" ? Number.parseInt(elements.dateYear.value, 10) : null,
      location: elements.location.value.trim(),
      description: elements.description.value.trim(),
      category_label: elements.category.value.trim(),
      short_label: elements.shortLabel.value.trim(),
      participant_groups: participantGroups,
      weapon_label: elements.weapon.value.trim() || null,
      start_time: elements.startTime.value || null,
      meeting_time: elements.meetingTime.value || null,
      time_zone: hasTime ? zone : null,
      organizer_contact: elements.contact.value.trim() || null,
      regulation_url: elements.regulation.value.trim() || null,
      document_title: documentTitle || null,
      document_url: documentUrl || null,
      published: elements.published.checked
    };

    setWorking(true, elements.save, "Сохраняем…");
    api.hideMessage();
    try {
      const query = editingItem
        ? api.getClient().from("competition_events").update(payload).eq("id", editingItem.id)
        : api.getClient().from("competition_events").insert(payload);
      const { error } = await query.select("id").single();
      if (error) {
        throw error;
      }
      api.setDirty(sectionName, false);
      discardChanges();
      await loadItems();
      api.showMessage("Событие сохранено.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось сохранить событие."), "error");
    } finally {
      setWorking(false, elements.save, "Сохранить");
    }
  }

  function reportInvalid(input, message) {
    input.setCustomValidity(message);
    input.reportValidity();
    input.setCustomValidity("");
  }

  async function togglePublished(item) {
    if (working) {
      return;
    }
    setWorking(true);
    try {
      const { error } = await api.getClient()
        .from("competition_events")
        .update({ published: !item.published })
        .eq("id", item.id);
      if (error) {
        throw error;
      }
      await loadItems();
      api.showMessage(item.published ? "Событие снято с публикации." : "Событие опубликовано.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось изменить публикацию события."), "error");
    } finally {
      setWorking(false);
    }
  }

  async function deleteItem(item) {
    if (working || !window.confirm(`Удалить событие «${item.title}»? Это действие нельзя отменить.`)) {
      return;
    }
    setWorking(true);
    try {
      const { error } = await api.getClient().from("competition_events").delete().eq("id", item.id);
      if (error) {
        throw error;
      }
      if (editingItem && String(editingItem.id) === String(item.id)) {
        discardChanges();
      }
      await loadItems();
      api.showMessage("Событие удалено.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось удалить событие."), "error");
    } finally {
      setWorking(false);
    }
  }

  function createButton(text, className, handler) {
    const button = api.createElement("button", { text, className });
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  function createStatus(published) {
    const status = api.createElement("span");
    setStatus(status, published);
    return status;
  }

  function setStatus(element, published) {
    element.textContent = published ? "Опубликовано" : "Черновик";
    element.className = published ? "status status-published" : "status status-draft";
  }

  function syncDateFields() {
    const precision = normalizePrecision(elements.datePrecision.value);
    const monthOnly = precision === "month";
    elements.exactDateFields.hidden = monthOnly;
    elements.monthDateFields.hidden = !monthOnly;
    elements.dateModeHint.hidden = precision !== "approximate";
    elements.startDate.required = !monthOnly;
    elements.dateMonth.required = monthOnly;
    elements.dateYear.required = monthOnly;
  }

  function readFormDateState() {
    return {
      date_precision: normalizePrecision(elements.datePrecision.value),
      start_date: elements.startDate.value || null,
      end_date: elements.endDate.value || null,
      date_month: elements.dateMonth.value ? Number.parseInt(elements.dateMonth.value, 10) : null,
      date_year: elements.dateYear.value ? Number.parseInt(elements.dateYear.value, 10) : null
    };
  }

  function normalizePrecision(value) {
    return value === "month" || value === "approximate" ? value : "exact";
  }

  function formatEventDate(item) {
    const precision = normalizePrecision(item.date_precision);
    if (precision === "month") {
      const month = MONTHS_NOMINATIVE[Number(item.date_month) - 1];
      return month && item.date_year ? `${month} ${item.date_year} · Дата уточняется` : "";
    }
    const exactDate = formatExactDateRange(item.start_date, item.end_date);
    return precision === "approximate" && exactDate ? `Ориентировочно ${exactDate}` : exactDate;
  }

  function formatExactDateRange(startValue, endValue) {
    const start = parseDate(startValue);
    const end = parseDate(endValue) || start;
    if (!start || !end) {
      return "";
    }
    const startDay = start.getUTCDate();
    const endDay = end.getUTCDate();
    const startMonth = MONTHS_GENITIVE[start.getUTCMonth()];
    const endMonth = MONTHS_GENITIVE[end.getUTCMonth()];
    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();

    if (startYear === endYear && start.getUTCMonth() === end.getUTCMonth()) {
      const days = startDay === endDay ? String(startDay) : `${startDay}–${endDay}`;
      return `${days} ${startMonth} ${startYear}`;
    }
    if (startYear === endYear) {
      return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${startYear}`;
    }
    return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  }

  function parseDate(value) {
    if (!value) {
      return null;
    }
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function setWorking(value, button, busyText) {
    working = value;
    api.setSectionBusy(sectionName, value);
    document.querySelectorAll('[data-admin-section="calendar"] button').forEach((control) => {
      control.disabled = value;
    });
    if (button) {
      button.textContent = value ? busyText : "Сохранить";
    }
  }

  function reset() {
    items = [];
    elements.period.value = "current";
    elements.publication.value = "all";
    loaded = false;
    working = false;
    discardChanges();
    elements.list.replaceChildren();
  }
})();
