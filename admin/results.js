(function () {
  "use strict";

  const sectionName = "results";
  const api = window.SiteAdmin;
  const elements = {
    add: document.getElementById("results-add-button"),
    editor: document.getElementById("results-editor"),
    editorTitle: document.getElementById("results-editor-title"),
    close: document.getElementById("results-close-button"),
    form: document.getElementById("results-form"),
    date: document.getElementById("results-date"),
    dateLabel: document.getElementById("results-date-label"),
    title: document.getElementById("results-title"),
    text: document.getElementById("results-text"),
    category: document.getElementById("results-category"),
    published: document.getElementById("results-published"),
    save: document.getElementById("results-save-button"),
    cancel: document.getElementById("results-cancel-button"),
    refresh: document.getElementById("results-refresh-button"),
    sort: document.getElementById("results-sort"),
    list: document.getElementById("results-list"),
    previewDate: document.getElementById("results-preview-date"),
    previewTitle: document.getElementById("results-preview-title"),
    previewText: document.getElementById("results-preview-text"),
    previewCategory: document.getElementById("results-preview-category"),
    previewStatus: document.getElementById("results-preview-status")
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
    elements.list.replaceChildren(api.createStateBlock("Загружаем результаты…", "loading-state"));
    elements.refresh.disabled = true;
    try {
      const { data, error } = await client
        .from("competition_results")
        .select("id,competition_date,date_label,title,result_text,category,published,created_at,updated_at")
        .order("competition_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      items = Array.isArray(data) ? data : [];
      loaded = true;
      renderList();
    } catch (error) {
      elements.list.replaceChildren(api.createStateBlock("Не удалось загрузить результаты."));
      api.showMessage(api.readableError(error, "Не удалось загрузить результаты."), "error");
    } finally {
      elements.refresh.disabled = false;
    }
  }

  function renderList() {
    if (items.length === 0) {
      elements.list.replaceChildren(api.createStateBlock("Результатов пока нет. Нажмите «Добавить результат»."));
      return;
    }
    const direction = elements.sort.value === "asc" ? 1 : -1;
    const sorted = [...items].sort((left, right) => left.competition_date.localeCompare(right.competition_date) * direction);
    const fragment = document.createDocumentFragment();
    sorted.forEach((item) => fragment.append(createRow(item)));
    elements.list.replaceChildren(fragment);
  }

  function createRow(item) {
    const row = api.createElement("article", { className: "record-row" });
    const content = api.createElement("div", { className: "record-row-content" });
    const date = api.createElement("p", { className: "record-meta", text: item.date_label || api.formatDate(item.competition_date) });
    const title = api.createElement("h3", { text: item.title });
    const summaryText = item.result_text.length > 220 ? `${item.result_text.slice(0, 220)}…` : item.result_text;
    const summary = api.createElement("p", { className: "record-summary preserve-lines", text: summaryText });
    const meta = api.createElement("div", { className: "record-status-line" });
    if (item.category) {
      meta.append(api.createElement("span", { className: "tag", text: item.category }));
    }
    meta.append(createStatus(item.published));
    content.append(date, title, summary, meta);

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
    elements.date.value = api.todayAsInputValue();
    elements.editorTitle.textContent = "Новый результат";
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
    elements.date.value = item.competition_date || "";
    elements.dateLabel.value = item.date_label || "";
    elements.title.value = item.title || "";
    elements.text.value = item.result_text || "";
    elements.category.value = item.category || "";
    elements.published.checked = Boolean(item.published);
    elements.editorTitle.textContent = "Изменение результата";
    elements.editor.hidden = false;
    api.setDirty(sectionName, false);
    updatePreview();
    focusEditor();
  }

  function prepareForAnotherForm() {
    return elements.editor.hidden || api.confirmDiscard(sectionName);
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
    elements.previewDate.textContent = elements.dateLabel.value.trim()
      || (elements.date.value ? api.formatDate(elements.date.value) : "Дата соревнования");
    elements.previewTitle.textContent = elements.title.value.trim() || "Название соревнования";
    elements.previewText.textContent = elements.text.value.trim() || "Результат появится здесь.";
    elements.previewCategory.textContent = elements.category.value.trim();
    elements.previewCategory.hidden = !elements.previewCategory.textContent;
    setStatus(elements.previewStatus, elements.published.checked);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (working || !elements.form.reportValidity()) {
      return;
    }
    if (!elements.title.value.trim() || !elements.text.value.trim()) {
      const invalidField = !elements.title.value.trim() ? elements.title : elements.text;
      invalidField.setCustomValidity(
        invalidField === elements.title ? "Укажите название соревнования." : "Укажите результат соревнования."
      );
      invalidField.reportValidity();
      invalidField.setCustomValidity("");
      return;
    }
    const payload = {
      competition_date: elements.date.value,
      date_label: elements.dateLabel.value.trim() || null,
      title: elements.title.value.trim(),
      result_text: elements.text.value.trim(),
      category: elements.category.value.trim(),
      published: elements.published.checked
    };
    setWorking(true, elements.save, "Сохраняем…");
    api.hideMessage();
    try {
      const query = editingItem
        ? api.getClient().from("competition_results").update(payload).eq("id", editingItem.id)
        : api.getClient().from("competition_results").insert(payload);
      const { error } = await query.select("id").single();
      if (error) {
        throw error;
      }
      api.setDirty(sectionName, false);
      discardChanges();
      await loadItems();
      api.showMessage("Результат сохранён.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось сохранить результат."), "error");
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
      const { error } = await api.getClient().from("competition_results").update({ published: !item.published }).eq("id", item.id);
      if (error) {
        throw error;
      }
      await loadItems();
      api.showMessage(item.published ? "Результат снят с публикации." : "Результат опубликован.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось изменить публикацию результата."), "error");
    } finally {
      setWorking(false);
    }
  }

  async function deleteItem(item) {
    if (working || !window.confirm(`Удалить результат «${item.title}»? Это действие нельзя отменить.`)) {
      return;
    }
    setWorking(true);
    try {
      const { error } = await api.getClient().from("competition_results").delete().eq("id", item.id);
      if (error) {
        throw error;
      }
      if (editingItem && String(editingItem.id) === String(item.id)) {
        discardChanges();
      }
      await loadItems();
      api.showMessage("Результат удалён.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось удалить результат."), "error");
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

  function setWorking(value, button, busyText) {
    working = value;
    api.setSectionBusy(sectionName, value);
    document.querySelectorAll('[data-admin-section="results"] button').forEach((control) => {
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
