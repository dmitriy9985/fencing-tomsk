(function () {
  "use strict";

  const sectionName = "results";
  const api = window.SiteAdmin;
  const elements = {
    add: document.getElementById("results-add-button"), editor: document.getElementById("results-editor"),
    editorTitle: document.getElementById("results-editor-title"), close: document.getElementById("results-close-button"),
    form: document.getElementById("results-form"), date: document.getElementById("results-date"),
    dateLabel: document.getElementById("results-date-label"), title: document.getElementById("results-title"),
    city: document.getElementById("results-city"), category: document.getElementById("results-category"),
    event: document.getElementById("results-event"), news: document.getElementById("results-news"),
    protocol: document.getElementById("results-protocol"), entries: document.getElementById("results-entries"),
    addEntry: document.getElementById("results-add-entry"), text: document.getElementById("results-text"),
    published: document.getElementById("results-published"), save: document.getElementById("results-save-button"),
    cancel: document.getElementById("results-cancel-button"), refresh: document.getElementById("results-refresh-button"),
    sort: document.getElementById("results-sort"), list: document.getElementById("results-list"),
    previewDate: document.getElementById("results-preview-date"), previewTitle: document.getElementById("results-preview-title"),
    previewText: document.getElementById("results-preview-text"), previewCategory: document.getElementById("results-preview-category"),
    previewStatus: document.getElementById("results-preview-status")
  };

  let items = [];
  let calendarEvents = [];
  let newsItems = [];
  let formEntries = [];
  let removedEntryIds = new Set();
  let nextEntryKey = 1;
  let editingItem = null;
  let loaded = false;
  let working = false;

  bindEvents();
  api.registerSection(sectionName, { activate, reset, discardChanges });

  function bindEvents() {
    elements.add.addEventListener("click", openCreateForm);
    elements.close.addEventListener("click", () => closeEditor(true));
    elements.cancel.addEventListener("click", () => closeEditor(true));
    elements.addEntry.addEventListener("click", () => addEntry());
    elements.form.addEventListener("submit", saveItem);
    elements.refresh.addEventListener("click", loadAll);
    elements.sort.addEventListener("change", renderList);
    elements.form.addEventListener("input", handleFormInput);
    elements.form.addEventListener("change", handleFormInput);
  }

  async function activate() {
    if (!loaded) {
      await loadAll();
    }
  }

  async function loadAll() {
    const client = api.getClient();
    if (!client) return;
    elements.list.replaceChildren(api.createStateBlock("Загружаем результаты…", "loading-state"));
    elements.refresh.disabled = true;
    try {
      const [resultsResponse, eventsResponse, newsResponse] = await Promise.all([
        client.from("competition_results").select(`
          id,competition_date,date_label,title,result_text,category,city,event_id,news_id,protocol_url,
          published,created_at,updated_at,
          entries:competition_result_entries(
            id,place,participant_name,weapon,age_category,competition_format,team_members,sort_order,created_at,updated_at
          )
        `).order("competition_date", { ascending: false }).order("created_at", { ascending: false }),
        client.from("competition_events")
          .select("id,title,start_date,date_precision,date_month,date_year,sort_date,location,published")
          .order("sort_date", { ascending: false }),
        client.from("news").select("id,title,date,published").order("date", { ascending: false }).order("created_at", { ascending: false })
      ]);
      if (resultsResponse.error) throw resultsResponse.error;
      if (eventsResponse.error) throw eventsResponse.error;
      if (newsResponse.error) throw newsResponse.error;
      items = (Array.isArray(resultsResponse.data) ? resultsResponse.data : []).map(normalizeItem);
      calendarEvents = Array.isArray(eventsResponse.data) ? eventsResponse.data : [];
      newsItems = Array.isArray(newsResponse.data) ? newsResponse.data : [];
      populateReferenceOptions();
      loaded = true;
      renderList();
    } catch (error) {
      elements.list.replaceChildren(api.createStateBlock("Не удалось загрузить результаты."));
      api.showMessage(api.readableError(error, "Не удалось загрузить результаты."), "error");
    } finally {
      elements.refresh.disabled = false;
    }
  }

  function normalizeItem(item) {
    const entries = Array.isArray(item.entries) ? [...item.entries] : [];
    entries.sort((left, right) => numberValue(left.sort_order) - numberValue(right.sort_order) || numberValue(left.place) - numberValue(right.place));
    return { ...item, entries };
  }

  function populateReferenceOptions() {
    replaceSelectOptions(elements.event, "Не связано с календарём", calendarEvents.map((item) => ({
      value: String(item.id),
      label: `${formatEventDate(item)} — ${item.title}${item.location ? `, ${item.location}` : ""}`
    })));
    replaceSelectOptions(elements.news, "Без связанной новости", newsItems.map((item) => ({
      value: String(item.id),
      label: `${api.formatDate(item.date)} — ${item.title}${item.published ? "" : " (черновик)"}`
    })));
  }

  function replaceSelectOptions(select, firstLabel, options) {
    const currentValue = select.value;
    const fragment = document.createDocumentFragment();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = firstLabel;
    fragment.append(empty);
    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      fragment.append(option);
    });
    select.replaceChildren(fragment);
    select.value = options.some((item) => item.value === currentValue) ? currentValue : "";
  }

  function renderList() {
    if (items.length === 0) {
      elements.list.replaceChildren(api.createStateBlock("Результатов пока нет. Нажмите «Добавить результат»."));
      return;
    }
    const direction = elements.sort.value === "asc" ? 1 : -1;
    const sorted = [...items].sort((left, right) => String(left.competition_date || "").localeCompare(String(right.competition_date || "")) * direction);
    const fragment = document.createDocumentFragment();
    sorted.forEach((item) => fragment.append(createRow(item)));
    elements.list.replaceChildren(fragment);
  }

  function createRow(item) {
    const row = api.createElement("article", { className: "record-row" });
    const content = api.createElement("div", { className: "record-row-content" });
    const date = api.createElement("p", { className: "record-meta", text: [item.date_label || api.formatDate(item.competition_date), item.city].filter(Boolean).join(" · ") });
    const title = api.createElement("h3", { text: item.title });
    const entryCount = item.entries.length;
    const summary = api.createElement("p", {
      className: "record-summary preserve-lines",
      text: entryCount > 0 ? `${entryCount} ${entryWord(entryCount)}` : (item.result_text || "Призовые места не указаны")
    });
    const meta = api.createElement("div", { className: "record-status-line" });
    if (item.category) meta.append(api.createElement("span", { className: "tag", text: item.category }));
    if (item.protocol_url) meta.append(api.createElement("span", { className: "tag", text: "Есть протокол" }));
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
    if (!prepareForAnotherForm()) return;
    editingItem = null;
    resetFormState();
    elements.date.value = api.todayAsInputValue();
    elements.editorTitle.textContent = "Новый результат";
    elements.editor.hidden = false;
    api.setDirty(sectionName, false);
    updatePreview();
    focusEditor();
  }

  function openEditForm(item) {
    if (!prepareForAnotherForm()) return;
    editingItem = item;
    resetFormState();
    elements.date.value = item.competition_date || "";
    elements.dateLabel.value = item.date_label || "";
    elements.title.value = item.title || "";
    elements.city.value = item.city || "";
    elements.category.value = item.category || "";
    elements.event.value = item.event_id == null ? "" : String(item.event_id);
    elements.news.value = item.news_id == null ? "" : String(item.news_id);
    elements.protocol.value = item.protocol_url || "";
    elements.text.value = item.result_text || "";
    elements.published.checked = Boolean(item.published);
    formEntries = item.entries.map((entry) => createFormEntry(entry));
    renderEntryEditor();
    elements.editorTitle.textContent = "Изменение результата";
    elements.editor.hidden = false;
    api.setDirty(sectionName, false);
    updatePreview();
    focusEditor();
  }

  function resetFormState() {
    elements.form.reset();
    formEntries = [];
    removedEntryIds = new Set();
    renderEntryEditor();
  }

  function prepareForAnotherForm() { return elements.editor.hidden || api.confirmDiscard(sectionName); }
  function focusEditor() {
    elements.title.focus({ preventScroll: true });
    elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function closeEditor(ask) {
    if (ask && !api.confirmDiscard(sectionName)) return;
    discardChanges();
  }
  function discardChanges() {
    editingItem = null;
    elements.editor.hidden = true;
    resetFormState();
    api.setDirty(sectionName, false);
  }

  function addEntry(source) {
    formEntries.push(createFormEntry(source));
    renderEntryEditor();
    api.setDirty(sectionName, true);
    updatePreview();
  }

  function createFormEntry(source) {
    const entry = source || {};
    return {
      key: nextEntryKey++, id: entry.id == null ? null : entry.id,
      place: entry.place == null ? 1 : numberValue(entry.place), participant_name: entry.participant_name || "",
      weapon: entry.weapon || "Шпага", age_category: entry.age_category || "",
      competition_format: entry.competition_format === "team" ? "team" : "individual",
      team_members: Array.isArray(entry.team_members) ? entry.team_members.join("\n") : ""
    };
  }

  function renderEntryEditor() {
    if (formEntries.length === 0) {
      elements.entries.replaceChildren(api.createStateBlock("Призовые места пока не добавлены."));
      return;
    }
    const fragment = document.createDocumentFragment();
    formEntries.forEach((entry, index) => fragment.append(createEntryCard(entry, index)));
    elements.entries.replaceChildren(fragment);
  }

  function createEntryCard(entry, index) {
    const card = api.createElement("article", { className: "result-entry-editor" });
    card.dataset.entryKey = String(entry.key);
    const heading = api.createElement("div", { className: "result-entry-editor-heading" });
    heading.append(api.createElement("h4", { text: `Результат ${index + 1}` }));
    const controls = api.createElement("div", { className: "result-entry-controls" });
    controls.append(
      createButton("↑", "icon-button icon-button-small", () => moveEntry(index, -1), "Поднять результат"),
      createButton("↓", "icon-button icon-button-small", () => moveEntry(index, 1), "Опустить результат"),
      createButton("Удалить", "button button-danger button-small", () => removeEntry(index))
    );
    heading.append(controls);
    const firstGrid = api.createElement("div", { className: "form-grid result-entry-grid" });
    firstGrid.append(
      createLabeledInput("Место", "number", "place", entry.place, { min: "1", max: "999", required: true }),
      createLabeledInput("Спортсмен или команда", "text", "participant_name", entry.participant_name, { maxlength: "300", required: true }),
      createLabeledInput("Оружие", "text", "weapon", entry.weapon, { maxlength: "100" })
    );
    const secondGrid = api.createElement("div", { className: "form-grid result-entry-grid result-entry-grid-secondary" });
    secondGrid.append(
      createLabeledInput("Возрастная категория", "text", "age_category", entry.age_category, { maxlength: "150" }),
      createFormatSelect(entry.competition_format)
    );
    const membersLabel = api.createElement("label", { className: "result-team-members-field" });
    membersLabel.append(document.createTextNode("Состав команды — по одному человеку в строке"));
    const members = document.createElement("textarea");
    members.dataset.entryField = "team_members";
    members.rows = 3;
    members.maxLength = 2000;
    members.value = entry.team_members;
    members.disabled = entry.competition_format !== "team";
    membersLabel.hidden = entry.competition_format !== "team";
    membersLabel.append(members);
    card.append(heading, firstGrid, secondGrid, membersLabel);
    return card;
  }

  function createLabeledInput(labelText, type, field, value, attributes) {
    const label = api.createElement("label", { text: labelText });
    const input = document.createElement("input");
    input.type = type;
    input.dataset.entryField = field;
    input.value = value == null ? "" : String(value);
    Object.entries(attributes || {}).forEach(([name, attributeValue]) => {
      if (name === "required") input.required = Boolean(attributeValue);
      else input.setAttribute(name, attributeValue);
    });
    label.append(input);
    return label;
  }

  function createFormatSelect(value) {
    const label = api.createElement("label", { text: "Формат" });
    const select = document.createElement("select");
    select.dataset.entryField = "competition_format";
    [{ value: "individual", label: "Личный" }, { value: "team", label: "Командный" }].forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.append(option);
    });
    select.value = value;
    label.append(select);
    return label;
  }

  function moveEntry(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= formEntries.length) return;
    [formEntries[index], formEntries[target]] = [formEntries[target], formEntries[index]];
    renderEntryEditor();
    api.setDirty(sectionName, true);
  }

  function removeEntry(index) {
    const [removed] = formEntries.splice(index, 1);
    if (removed && removed.id != null) removedEntryIds.add(removed.id);
    renderEntryEditor();
    api.setDirty(sectionName, true);
    updatePreview();
  }

  function handleFormInput(event) {
    const field = event.target.dataset.entryField;
    if (field) {
      const card = event.target.closest("[data-entry-key]");
      const entry = card && formEntries.find((item) => String(item.key) === card.dataset.entryKey);
      if (entry) {
        entry[field] = field === "place" ? numberValue(event.target.value) : event.target.value;
        if (field === "competition_format") {
          if (entry.competition_format !== "team") entry.team_members = "";
          renderEntryEditor();
        }
      }
    }
    if (!elements.editor.hidden) {
      api.setDirty(sectionName, true);
      updatePreview();
    }
  }

  function updatePreview() {
    elements.previewDate.textContent = elements.dateLabel.value.trim() || (elements.date.value ? api.formatDate(elements.date.value) : "Дата соревнования");
    elements.previewTitle.textContent = elements.title.value.trim() || "Название соревнования";
    elements.previewText.textContent = formEntries.length > 0
      ? `${formEntries.length} ${entryWord(formEntries.length)}`
      : (elements.text.value.trim() || "Призовые места пока не добавлены.");
    elements.previewCategory.textContent = [elements.city.value.trim(), elements.category.value.trim()].filter(Boolean).join(" · ");
    elements.previewCategory.hidden = !elements.previewCategory.textContent;
    setStatus(elements.previewStatus, elements.published.checked);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (working || !elements.form.reportValidity()) return;
    if (!elements.title.value.trim()) {
      elements.title.setCustomValidity("Укажите название соревнования.");
      elements.title.reportValidity();
      elements.title.setCustomValidity("");
      return;
    }
    if (elements.protocol.value && !/^https?:\/\//i.test(elements.protocol.value.trim())) {
      elements.protocol.setCustomValidity("Ссылка на протокол должна начинаться с http:// или https://.");
      elements.protocol.reportValidity();
      elements.protocol.setCustomValidity("");
      return;
    }
    if (formEntries.some((entry) => numberValue(entry.place) < 1 || !entry.participant_name.trim())) {
      api.showMessage("Для каждого результата укажите место и спортсмена либо команду.", "error");
      return;
    }
    const payload = {
      competition_date: elements.date.value, date_label: elements.dateLabel.value.trim() || null,
      title: elements.title.value.trim(), city: elements.city.value.trim(), category: elements.category.value.trim(),
      event_id: optionalNumber(elements.event.value), news_id: optionalNumber(elements.news.value),
      protocol_url: elements.protocol.value.trim() || null, result_text: elements.text.value.trim(),
      published: elements.published.checked
    };
    setWorking(true, elements.save, "Сохраняем…");
    api.hideMessage();
    let parentSaved = false;
    try {
      const query = editingItem
        ? api.getClient().from("competition_results").update(payload).eq("id", editingItem.id)
        : api.getClient().from("competition_results").insert(payload);
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      parentSaved = true;
      if (!editingItem) {
        editingItem = { id: data.id };
      }
      await saveEntries(data.id);
      api.setDirty(sectionName, false);
      discardChanges();
      await loadAll();
      api.showMessage("Результат сохранён.", "success");
    } catch (error) {
      const fallback = parentSaved
        ? "Турнир сохранён, но часть призовых мест сохранить не удалось. Не закрывайте форму и повторите сохранение."
        : "Не удалось сохранить результат.";
      const readable = api.readableError(error, fallback);
      api.showMessage(parentSaved && readable !== fallback ? `${fallback} ${readable}` : readable, "error");
    } finally {
      setWorking(false, elements.save, "Сохранить");
    }
  }

  async function saveEntries(parentId) {
    const existing = formEntries.filter((entry) => entry.id != null);
    const fresh = formEntries.filter((entry) => entry.id == null);
    for (let index = 0; index < existing.length; index += 1) {
      const entry = existing[index];
      const { error } = await api.getClient().from("competition_result_entries")
        .update(entryPayload(entry, formEntries.indexOf(entry))).eq("id", entry.id).eq("competition_result_id", parentId);
      if (error) throw error;
    }
    if (fresh.length > 0) {
      const payload = fresh.map((entry) => ({ ...entryPayload(entry, formEntries.indexOf(entry)), competition_result_id: parentId }));
      const { data, error } = await api.getClient().from("competition_result_entries").insert(payload).select("id,sort_order");
      if (error) throw error;
      (Array.isArray(data) ? data : []).forEach((saved) => {
        const entry = formEntries[numberValue(saved.sort_order)];
        if (entry && entry.id == null) {
          entry.id = saved.id;
        }
      });
    }
    if (removedEntryIds.size > 0) {
      const { error } = await api.getClient().from("competition_result_entries").delete()
        .eq("competition_result_id", parentId).in("id", [...removedEntryIds]);
      if (error) throw error;
    }
  }

  function entryPayload(entry, sortOrder) {
    return {
      place: numberValue(entry.place), participant_name: entry.participant_name.trim(), weapon: entry.weapon.trim(),
      age_category: entry.age_category.trim(), competition_format: entry.competition_format,
      team_members: entry.competition_format === "team"
        ? entry.team_members.split(/\r?\n/).map((member) => member.trim()).filter(Boolean) : [],
      sort_order: sortOrder
    };
  }

  async function togglePublished(item) {
    if (working) return;
    setWorking(true);
    try {
      const { error } = await api.getClient().from("competition_results").update({ published: !item.published }).eq("id", item.id);
      if (error) throw error;
      await loadAll();
      api.showMessage(item.published ? "Результат снят с публикации." : "Результат опубликован.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось изменить публикацию результата."), "error");
    } finally { setWorking(false); }
  }

  async function deleteItem(item) {
    if (working || !window.confirm(`Удалить результат «${item.title}»? Призовые места также будут удалены. Это действие нельзя отменить.`)) return;
    setWorking(true);
    try {
      const { error } = await api.getClient().from("competition_results").delete().eq("id", item.id);
      if (error) throw error;
      if (editingItem && String(editingItem.id) === String(item.id)) discardChanges();
      await loadAll();
      api.showMessage("Результат удалён.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось удалить результат."), "error");
    } finally { setWorking(false); }
  }

  function createButton(text, className, handler, ariaLabel) {
    const button = api.createElement("button", { text, className });
    button.type = "button";
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", handler);
    return button;
  }
  function createStatus(published) { const status = api.createElement("span"); setStatus(status, published); return status; }
  function setStatus(element, published) {
    element.textContent = published ? "Опубликовано" : "Черновик";
    element.className = published ? "status status-published" : "status status-draft";
  }
  function setWorking(value, button, busyText) {
    working = value;
    api.setSectionBusy(sectionName, value);
    document.querySelectorAll('[data-admin-section="results"] button').forEach((control) => { control.disabled = value; });
    if (button) button.textContent = value ? busyText : "Сохранить";
  }
  function formatEventDate(item) {
    if (item.date_precision === "month" && item.date_month && item.date_year) {
      return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
        .format(new Date(Date.UTC(item.date_year, item.date_month - 1, 1)));
    }
    return api.formatDate(item.start_date || item.sort_date) || "Дата не указана";
  }
  function entryWord(value) {
    const lastTwo = value % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return "результатов";
    const last = value % 10;
    if (last === 1) return "результат";
    if (last >= 2 && last <= 4) return "результата";
    return "результатов";
  }
  function numberValue(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function optionalNumber(value) { return value ? Number(value) : null; }
  function reset() {
    items = []; calendarEvents = []; newsItems = []; loaded = false; working = false;
    discardChanges();
    elements.list.replaceChildren();
  }
})();
