(function () {
  "use strict";

  const MAX_SOURCE_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 1920;
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const STORAGE_BUCKET = "news-images";
  const ADMIN_SECTIONS = new Set(["news", "calendar", "results", "gallery", "home"]);

  const elements = {
    message: document.getElementById("message"),
    configPanel: document.getElementById("config-panel"),
    loginPanel: document.getElementById("login-panel"),
    loginForm: document.getElementById("login-form"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    loginButton: document.getElementById("login-button"),
    dashboard: document.getElementById("dashboard"),
    accountLabel: document.getElementById("account-label"),
    sectionLinks: document.querySelectorAll("[data-section-link]"),
    adminSections: document.querySelectorAll("[data-admin-section]"),
    addButton: document.getElementById("add-button"),
    logoutButton: document.getElementById("logout-button"),
    refreshButton: document.getElementById("refresh-button"),
    newsList: document.getElementById("news-list"),
    editorPanel: document.getElementById("editor-panel"),
    editorTitle: document.getElementById("editor-title"),
    closeEditorButton: document.getElementById("close-editor-button"),
    cancelButton: document.getElementById("cancel-button"),
    newsForm: document.getElementById("news-form"),
    title: document.getElementById("news-title"),
    date: document.getElementById("news-date"),
    summary: document.getElementById("news-summary"),
    content: document.getElementById("news-content"),
    image: document.getElementById("news-image"),
    imageHelp: document.getElementById("image-help"),
    published: document.getElementById("news-published"),
    saveButton: document.getElementById("save-button"),
    previewImage: document.getElementById("preview-image"),
    previewImagePlaceholder: document.getElementById("preview-image-placeholder"),
    previewDate: document.getElementById("preview-date"),
    previewTitle: document.getElementById("preview-title"),
    previewSummary: document.getElementById("preview-summary"),
    previewFullText: document.getElementById("preview-full-text"),
    previewStatus: document.getElementById("preview-status")
  };

  let client = null;
  let currentUser = null;
  let newsItems = [];
  let editingItem = null;
  let previewObjectUrl = "";
  let busy = false;
  let activeSection = "";

  window.SiteAdmin.registerSection("news", { discardChanges: () => closeEditor(true) });
  bindEvents();
  start();

  async function start() {
    const config = window.SUPABASE_CONFIG;

    if (!isConfigured(config)) {
      showOnly("config");
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showOnly("config");
      showMessage("Не удалось загрузить библиотеку Supabase. Проверьте подключение к интернету.", "error");
      return;
    }

    client = window.supabase.createClient(config.url, config.anonKey);

    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        throw error;
      }

      if (data.session && data.session.user) {
        await enterDashboard(data.session.user);
      } else {
        showOnly("login");
      }
    } catch (error) {
      showOnly("login");
      showMessage(readableError(error, "Не удалось проверить текущий вход."), "error");
    }
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.logoutButton.addEventListener("click", handleLogout);
    elements.addButton.addEventListener("click", openCreateForm);
    elements.refreshButton.addEventListener("click", loadNews);
    elements.closeEditorButton.addEventListener("click", () => closeEditor(false));
    elements.cancelButton.addEventListener("click", () => closeEditor(false));
    elements.newsForm.addEventListener("submit", saveNews);

    [elements.title, elements.date, elements.summary, elements.content, elements.published]
      .forEach((field) => field.addEventListener("input", () => {
        if (!elements.editorPanel.hidden) {
          window.SiteAdmin.setDirty("news", true);
        }
        updatePreview();
      }));

    elements.image.addEventListener("change", handlePreviewImage);
    elements.previewImage.addEventListener("error", () => setPreviewImage(""));
    window.addEventListener("hashchange", updateSectionFromHash);
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!client || busy || !elements.loginForm.reportValidity()) {
      return;
    }

    setBusy(true, elements.loginButton, "Входим…");
    hideMessage();

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: elements.loginEmail.value.trim(),
        password: elements.loginPassword.value
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error("Пользователь не найден.");
      }

      elements.loginPassword.value = "";
      await enterDashboard(data.user);
    } catch (error) {
      showMessage(readableError(error, "Не удалось войти. Проверьте email и пароль."), "error");
    } finally {
      setBusy(false, elements.loginButton, "Войти");
    }
  }

  async function enterDashboard(user) {
    const { data, error } = await client
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      await client.auth.signOut();
      showOnly("login");
      throw new Error("Для этого пользователя не выдан доступ администратора.");
    }

    currentUser = user;
    window.SiteAdmin.setSession(client, user);
    elements.accountLabel.textContent = user.email ? `Вы вошли как ${user.email}` : "Выполнен вход администратора";
    showOnly("dashboard");
    updateSectionFromHash();
    await loadNews();
  }

  async function handleLogout() {
    if (!client || busy) {
      return;
    }

    if (activeSection && !window.SiteAdmin.confirmDiscard(activeSection)) {
      return;
    }

    setBusy(true, elements.logoutButton, "Выходим…");
    try {
      await client.auth.signOut();
    } finally {
      currentUser = null;
      newsItems = [];
      closeEditor(true);
      window.SiteAdmin.clearSession();
      activeSection = "";
      showOnly("login");
      setBusy(false, elements.logoutButton, "Выйти");
      showMessage("Вы вышли из админки.", "success");
    }
  }

  async function loadNews() {
    if (!client || !currentUser) {
      return;
    }

    renderLoading();
    elements.refreshButton.disabled = true;

    try {
      const { data, error } = await client
        .from("news")
        .select("id,title,date,date_label,summary,content,image_url,image_path,published,created_at,updated_at")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      newsItems = Array.isArray(data) ? data : [];
      renderNewsList();
    } catch (error) {
      elements.newsList.replaceChildren(createStateBlock("Не удалось загрузить список новостей.", "empty-state"));
      showMessage(readableError(error, "Не удалось загрузить список новостей."), "error");
    } finally {
      elements.refreshButton.disabled = false;
    }
  }

  function renderLoading() {
    elements.newsList.replaceChildren(createStateBlock("Загружаем новости…", "loading-state"));
  }

  function renderNewsList() {
    if (newsItems.length === 0) {
      elements.newsList.replaceChildren(createStateBlock("Новостей пока нет. Нажмите «Добавить новость».", "empty-state"));
      return;
    }

    const fragment = document.createDocumentFragment();
    newsItems.forEach((item) => fragment.append(createNewsRow(item)));
    elements.newsList.replaceChildren(fragment);
  }

  function createNewsRow(item) {
    const row = document.createElement("article");
    row.className = "news-row";

    const imageWrap = document.createElement("div");
    imageWrap.className = "news-row-image";

    if (item.image_url) {
      const image = document.createElement("img");
      image.src = resolveAdminImageUrl(item.image_url);
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        imageWrap.textContent = "Нет фото";
      }, { once: true });
      imageWrap.append(image);
    } else {
      imageWrap.textContent = "Нет фото";
    }

    const content = document.createElement("div");
    content.className = "news-row-content";

    const date = document.createElement("p");
    date.className = "news-row-date";
    date.textContent = item.date_label || formatDate(item.date);

    const title = document.createElement("h3");
    title.textContent = item.title;

    const status = document.createElement("span");
    status.className = item.published ? "status status-published" : "status status-draft";
    status.textContent = item.published ? "Опубликовано" : "Черновик";
    content.append(date, title, status);

    const actions = document.createElement("div");
    actions.className = "news-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button-secondary button-small";
    editButton.textContent = "Изменить";
    editButton.addEventListener("click", () => openEditForm(item.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button-danger button-small";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", () => deleteNews(item.id));

    actions.append(editButton, deleteButton);
    row.append(imageWrap, content, actions);
    return row;
  }

  function openCreateForm() {
    if (!elements.editorPanel.hidden && !window.SiteAdmin.confirmDiscard("news")) {
      return;
    }
    editingItem = null;
    elements.newsForm.reset();
    elements.date.value = todayAsInputValue();
    elements.editorTitle.textContent = "Новая новость";
    elements.imageHelp.textContent = "JPG, JPEG, PNG или WEBP. Для новой новости фотография обязательна. До 10 МБ.";
    clearPreviewObjectUrl();
    setPreviewImage("");
    elements.editorPanel.hidden = false;
    window.SiteAdmin.setDirty("news", false);
    updatePreview();
    elements.title.focus({ preventScroll: true });
    elements.editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openEditForm(id) {
    if (!elements.editorPanel.hidden && !window.SiteAdmin.confirmDiscard("news")) {
      return;
    }
    const item = newsItems.find((candidate) => String(candidate.id) === String(id));
    if (!item) {
      showMessage("Новость не найдена. Обновите список.", "error");
      return;
    }

    editingItem = item;
    elements.newsForm.reset();
    elements.title.value = item.title || "";
    elements.date.value = item.date || "";
    elements.summary.value = item.summary || "";
    elements.content.value = item.content || "";
    elements.published.checked = Boolean(item.published);
    elements.editorTitle.textContent = "Изменение новости";
    elements.imageHelp.textContent = "Оставьте поле пустым, чтобы сохранить текущую фотографию. Новый файл: JPG, JPEG, PNG или WEBP, до 10 МБ.";
    clearPreviewObjectUrl();
    setPreviewImage(resolveAdminImageUrl(item.image_url));
    elements.editorPanel.hidden = false;
    window.SiteAdmin.setDirty("news", false);
    updatePreview();
    elements.editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeEditor(skipConfirmation) {
    if (!skipConfirmation && !window.SiteAdmin.confirmDiscard("news")) {
      return;
    }
    editingItem = null;
    elements.editorPanel.hidden = true;
    elements.newsForm.reset();
    clearPreviewObjectUrl();
    setPreviewImage("");
    window.SiteAdmin.setDirty("news", false);
  }

  function updatePreview() {
    elements.previewTitle.textContent = elements.title.value.trim() || "Заголовок новости";
    elements.previewDate.textContent = elements.date.value ? formatDate(elements.date.value) : "Дата новости";
    elements.previewSummary.textContent = elements.summary.value.trim() || "Краткое описание появится здесь.";
    elements.previewFullText.textContent = elements.content.value.trim() || "Полный текст появится здесь.";
    elements.previewStatus.textContent = elements.published.checked ? "Опубликовано" : "Черновик";
    elements.previewStatus.className = elements.published.checked
      ? "status status-published"
      : "status status-draft";
  }

  function handlePreviewImage() {
    clearPreviewObjectUrl();
    const file = elements.image.files && elements.image.files[0];

    if (!file) {
      setPreviewImage(editingItem ? resolveAdminImageUrl(editingItem.image_url) : "");
      return;
    }

    const validationError = validateImage(file);
    if (validationError) {
      elements.image.value = "";
      setPreviewImage(editingItem ? resolveAdminImageUrl(editingItem.image_url) : "");
      showMessage(validationError, "error");
      return;
    }

    previewObjectUrl = URL.createObjectURL(file);
    setPreviewImage(previewObjectUrl);
    window.SiteAdmin.setDirty("news", true);
  }

  function setPreviewImage(source) {
    if (source) {
      elements.previewImage.src = source;
      elements.previewImage.hidden = false;
      elements.previewImagePlaceholder.hidden = true;
    } else {
      elements.previewImage.removeAttribute("src");
      elements.previewImage.hidden = true;
      elements.previewImagePlaceholder.hidden = false;
    }
  }

  function clearPreviewObjectUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = "";
    }
  }

  async function saveNews(event) {
    event.preventDefault();
    if (!client || !currentUser || busy || !elements.newsForm.reportValidity()) {
      return;
    }

    const selectedFile = elements.image.files && elements.image.files[0];
    if (!editingItem && !selectedFile) {
      showMessage("Для новой новости выберите фотографию.", "error");
      elements.image.focus();
      return;
    }

    if (selectedFile) {
      const validationError = validateImage(selectedFile);
      if (validationError) {
        showMessage(validationError, "error");
        return;
      }
    }

    setBusy(true, elements.saveButton, "Сохраняем…");
    hideMessage();

    let uploadedPath = "";
    let imageUrl = editingItem ? editingItem.image_url : "";
    let imagePath = editingItem ? editingItem.image_path : null;

    try {
      if (selectedFile) {
        const preparedFile = await prepareImage(selectedFile);
        uploadedPath = createStoragePath(preparedFile.type);

        const { error: uploadError } = await client.storage
          .from(STORAGE_BUCKET)
          .upload(uploadedPath, preparedFile, {
            cacheControl: "31536000",
            contentType: preparedFile.type,
            upsert: false
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = client.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(uploadedPath);

        imageUrl = publicUrlData.publicUrl;
        imagePath = uploadedPath;
      }

      const selectedDate = elements.date.value;
      const payload = {
        title: elements.title.value.trim(),
        date: selectedDate,
        date_label: editingItem && editingItem.date === selectedDate ? editingItem.date_label : null,
        summary: elements.summary.value.trim(),
        content: elements.content.value.trim(),
        image_url: imageUrl,
        image_path: imagePath,
        published: elements.published.checked
      };

      let saveResult;
      if (editingItem) {
        saveResult = await client
          .from("news")
          .update(payload)
          .eq("id", editingItem.id)
          .select()
          .single();
      } else {
        saveResult = await client
          .from("news")
          .insert(payload)
          .select()
          .single();
      }

      if (saveResult.error) {
        throw saveResult.error;
      }

      const previousImagePath = editingItem ? editingItem.image_path : null;
      window.SiteAdmin.setDirty("news", false);
      closeEditor(true);
      await loadNews();

      if (uploadedPath && previousImagePath && previousImagePath !== uploadedPath) {
        const { error: removeOldError } = await client.storage
          .from(STORAGE_BUCKET)
          .remove([previousImagePath]);

        if (removeOldError) {
          showMessage("Новость сохранена, но старую фотографию не удалось удалить из хранилища.", "error");
          return;
        }
      }

      showMessage("Новость сохранена.", "success");
    } catch (error) {
      if (uploadedPath) {
        await client.storage.from(STORAGE_BUCKET).remove([uploadedPath]);
      }
      showMessage(readableError(error, "Не удалось сохранить новость."), "error");
    } finally {
      setBusy(false, elements.saveButton, "Сохранить");
    }
  }

  async function deleteNews(id) {
    if (!client || !currentUser || busy) {
      return;
    }

    const item = newsItems.find((candidate) => String(candidate.id) === String(id));
    if (!item) {
      showMessage("Новость не найдена. Обновите список.", "error");
      return;
    }

    const confirmed = window.confirm(`Удалить новость «${item.title}»? Это действие нельзя отменить.`);
    if (!confirmed) {
      return;
    }

    busy = true;
    window.SiteAdmin.setSectionBusy("news", true);
    setListButtonsDisabled(true);
    hideMessage();

    try {
      const { error } = await client.from("news").delete().eq("id", item.id);
      if (error) {
        throw error;
      }

      let imageWarning = false;
      if (item.image_path) {
        const { error: imageError } = await client.storage
          .from(STORAGE_BUCKET)
          .remove([item.image_path]);
        imageWarning = Boolean(imageError);
      }

      if (editingItem && String(editingItem.id) === String(item.id)) {
        closeEditor(true);
      }

      await loadNews();
      showMessage(
        imageWarning
          ? "Новость удалена, но фотографию не удалось удалить из хранилища."
          : "Новость удалена.",
        imageWarning ? "error" : "success"
      );
    } catch (error) {
      showMessage(readableError(error, "Не удалось удалить новость."), "error");
    } finally {
      busy = false;
      window.SiteAdmin.setSectionBusy("news", false);
      setListButtonsDisabled(false);
    }
  }

  function validateImage(file) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return "Разрешены только изображения JPG, JPEG, PNG и WEBP.";
    }

    if (file.size > MAX_SOURCE_FILE_SIZE) {
      return "Файл слишком большой. Выберите изображение размером не более 10 МБ.";
    }

    return "";
  }

  async function prepareImage(file) {
    const image = await loadLocalImage(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / image.naturalWidth, MAX_IMAGE_SIDE / image.naturalHeight);
    const shouldResize = scale < 1 || file.size > MAX_UPLOAD_FILE_SIZE;

    if (!shouldResize) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });

    if (!context) {
      throw new Error("Браузер не смог подготовить изображение.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const outputType = file.type;
    const blob = await canvasToBlob(canvas, outputType, outputType === "image/png" ? undefined : 0.86);

    if (blob.size > MAX_UPLOAD_FILE_SIZE) {
      throw new Error("После уменьшения фотография всё ещё больше 5 МБ. Выберите другой файл.");
    }

    return new File([blob], `news-image.${extensionForType(outputType)}`, {
      type: outputType,
      lastModified: Date.now()
    });
  }

  function loadLocalImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.addEventListener("load", () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      }, { once: true });

      image.addEventListener("error", () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Не удалось прочитать изображение. Возможно, файл повреждён."));
      }, { once: true });

      image.src = objectUrl;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Не удалось уменьшить изображение."));
        }
      }, type, quality);
    });
  }

  function createStoragePath(type) {
    const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${currentUser.id}/${Date.now()}-${randomPart}.${extensionForType(type)}`;
  }

  function extensionForType(type) {
    if (type === "image/png") {
      return "png";
    }
    if (type === "image/webp") {
      return "webp";
    }
    return "jpg";
  }

  function createStateBlock(text, className) {
    const block = document.createElement("div");
    block.className = className;
    block.textContent = text;
    return block;
  }

  function resolveAdminImageUrl(value) {
    if (!value) {
      return "";
    }

    try {
      if (/^(https?:|blob:|data:)/i.test(value)) {
        return new URL(value).href;
      }

      const cleanPath = value.replace(/^\.\//, "").replace(/^\//, "");
      return new URL(`../${cleanPath}`, document.baseURI).href;
    } catch (error) {
      return "";
    }
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(parsed);
  }

  function todayAsInputValue() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function isConfigured(config) {
    return Boolean(
      config
      && typeof config.url === "string"
      && typeof config.anonKey === "string"
      && config.url.startsWith("https://")
      && !config.url.includes("YOUR_SUPABASE")
      && config.anonKey.length > 20
      && !config.anonKey.includes("YOUR_SUPABASE")
    );
  }

  function updateSectionFromHash() {
    const requestedSection = window.location.hash.slice(1).toLowerCase();
    const nextSection = ADMIN_SECTIONS.has(requestedSection) ? requestedSection : "news";
    const expectedHash = `#${nextSection}`;

    if (window.location.hash !== expectedHash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${expectedHash}`
      );
    }

    if (activeSection && activeSection !== nextSection && !window.SiteAdmin.confirmDiscard(activeSection)) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${activeSection}`
      );
      return;
    }

    if (activeSection && activeSection !== nextSection) {
      window.SiteAdmin.discardSection(activeSection);
    }

    activeSection = nextSection;

    elements.adminSections.forEach((section) => {
      section.hidden = section.dataset.adminSection !== activeSection;
    });

    elements.sectionLinks.forEach((link) => {
      if (link.dataset.sectionLink === activeSection) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    window.SiteAdmin.activateSection(activeSection);
  }

  function showOnly(panel) {
    elements.configPanel.hidden = panel !== "config";
    elements.loginPanel.hidden = panel !== "login";
    elements.dashboard.hidden = panel !== "dashboard";
  }

  function showMessage(text, type) {
    elements.message.textContent = text;
    elements.message.className = `message ${type || ""}`.trim();
    elements.message.hidden = false;
    elements.message.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideMessage() {
    elements.message.hidden = true;
    elements.message.textContent = "";
    elements.message.className = "message";
  }

  function setBusy(value, button, busyText) {
    if (value && !button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent;
    }

    busy = value;
    if (currentUser && activeSection) {
      window.SiteAdmin.setSectionBusy(activeSection, value);
    }
    button.disabled = value;
    button.textContent = value ? busyText : button.dataset.defaultText || button.textContent;
  }

  function setListButtonsDisabled(disabled) {
    elements.newsList.querySelectorAll("button").forEach((button) => {
      button.disabled = disabled;
    });
  }

  function readableError(error, fallback) {
    if (!error || typeof error.message !== "string") {
      return fallback;
    }

    const normalized = error.message.toLowerCase();
    if (normalized.includes("invalid login credentials")) {
      return "Неверный email или пароль.";
    }
    if (normalized.includes("email not confirmed")) {
      return "Email администратора ещё не подтверждён.";
    }
    if (normalized.includes("row-level security") || normalized.includes("permission denied")) {
      return "Операция запрещена политиками безопасности. Проверьте настройку администратора и RLS.";
    }
    if (normalized.includes("failed to fetch") || normalized.includes("network")) {
      return "Нет связи с Supabase. Проверьте интернет и настройки проекта.";
    }

    return error.message || fallback;
  }
})();
