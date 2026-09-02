(function () {
  "use strict";

  const sectionName = "calendar";
  const api = window.SiteAdmin;
  const elements = {
    add: document.getElementById("calendar-add-button"),
    editor: document.getElementById("calendar-editor"),
    editorTitle: document.getElementById("calendar-editor-title"),
    close: document.getElementById("calendar-close-button"),
    form: document.getElementById("calendar-form"),
    title: document.getElementById("calendar-title"),
    startDate: document.getElementById("calendar-start-date"),
    endDate: document.getElementById("calendar-end-date"),
    location: document.getElementById("calendar-location"),
    description: document.getElementById("calendar-description"),
    category: document.getElementById("calendar-category"),
    shortLabel: document.getElementById("calendar-short-label"),
    published: document.getElementById("calendar-published"),
    save: document.getElementById("calendar-save-button"),
    cancel: document.getElementById("calendar-cancel-button"),
    refresh: document.getElementById("calendar-refresh-button"),
    sort: document.getElementById("calendar-sort"),
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
    elements.form.addEventListener("submit", saveItem);
    elements.refresh.addEventListener("click", loadItems);
    elements.sort.addEventListener("change", renderList);
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
        .select("id,title,start_date,end_date,location,description,category_label,short_label,published,created_at,updated_at")
        .order("start_date", { ascending: true })
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
    const sorted = [...items].sort((left, right) => {
      const direction = elements.sort.value === "desc" ? -1 : 1;
      return left.start_date.localeCompare(right.start_date) * direction;
    });
    const fragment = document.createDocumentFragment();
    sorted.forEach((item) => fragment.append(createRow(item)));
    elements.list.replaceChildren(fragment);
  }

  function createRow(item) {
    const row = api.createElement("article", { className: "record-row" });
    const content = api.createElement("div", { className: "record-row-content" });
    const date = api.createElement("p", { className: "record-meta", text: formatDateRange(item.start_date, item.end_date) });
    const title = api.createElement("h3", { text: item.title });
    const details = api.createElement("p", {
      className: "record-summary",
      text: [item.location, item.category_label].filter(Boolean).join(" · ") || "Место и категория не указаны"
    });
    const status = createStatus(item.published);
    content.append(date, title, details, status);

    const actions = api.createElement("div", { className: "record-actions" });
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
    elements.startDate.value = api.todayAsInputValue();
    elements.editorTitle.textContent = "Новое событие";
    elements.editor.hidden = false;
    api.setDirty(sectionName, false);
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
    elements.startDate.value = item.start_date || "";
    elements.endDate.value = item.end_date || "";
    elements.location.value = item.location || "";
    elements.description.value = item.description || "";
    elements.category.value = item.category_label || "";
    elements.shortLabel.value = item.short_label || "";
    elements.published.checked = Boolean(item.published);
    elements.editorTitle.textContent = "Изменение события";
    elements.editor.hidden = false;
    api.setDirty(sectionName, false);
    updatePreview();
    focusEditor();
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
    api.setDirty(sectionName, false);
  }

  function updatePreview() {
    elements.previewDate.textContent = elements.startDate.value
      ? formatDateRange(elements.startDate.value, elements.endDate.value)
      : "Дата события";
    elements.previewTitle.textContent = elements.title.value.trim() || "Название события";
    elements.previewLocation.textContent = elements.location.value.trim() || "Место проведения";
    elements.previewDescription.textContent = elements.description.value.trim() || "Описание события появится здесь.";
    elements.previewCategory.textContent = elements.category.value.trim();
    elements.previewCategory.hidden = !elements.previewCategory.textContent;
    setStatus(elements.previewStatus, elements.published.checked);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (working || !elements.form.reportValidity()) {
      return;
    }
    if (!elements.title.value.trim()) {
      elements.title.setCustomValidity("Укажите название события.");
      elements.title.reportValidity();
      elements.title.setCustomValidity("");
      return;
    }
    if (elements.endDate.value && elements.endDate.value < elements.startDate.value) {
      elements.endDate.setCustomValidity("Дата окончания не может быть раньше даты начала.");
      elements.endDate.reportValidity();
      elements.endDate.setCustomValidity("");
      return;
    }

    const payload = {
      title: elements.title.value.trim(),
      start_date: elements.startDate.value,
      end_date: elements.endDate.value || null,
      location: elements.location.value.trim(),
      description: elements.description.value.trim(),
      category_label: elements.category.value.trim(),
      short_label: elements.shortLabel.value.trim(),
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

  function formatDateRange(startDate, endDate) {
    const start = api.formatDate(startDate);
    const end = api.formatDate(endDate);
    return end && endDate !== startDate ? `${start} — ${end}` : start;
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
    loaded = false;
    working = false;
    discardChanges();
    elements.list.replaceChildren();
  }
})();
