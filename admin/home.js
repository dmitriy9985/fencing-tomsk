(function () {
  "use strict";

  const sectionName = "home";
  const bucket = "site-images";
  const api = window.SiteAdmin;
  const elements = {
    form: document.getElementById("home-form"),
    kicker: document.getElementById("home-hero-kicker"),
    title: document.getElementById("home-hero-title"),
    subtitle: document.getElementById("home-hero-subtitle"),
    image: document.getElementById("home-hero-image"),
    aboutTitle: document.getElementById("home-about-title"),
    aboutText: document.getElementById("home-about-text"),
    save: document.getElementById("home-save-button"),
    cancel: document.getElementById("home-cancel-button"),
    previewImage: document.getElementById("home-preview-image"),
    previewPlaceholder: document.getElementById("home-preview-image-placeholder"),
    previewKicker: document.getElementById("home-preview-kicker"),
    previewTitle: document.getElementById("home-preview-title"),
    previewSubtitle: document.getElementById("home-preview-subtitle")
  };

  let content = null;
  let loaded = false;
  let working = false;
  let previewObjectUrl = "";

  bindEvents();
  api.registerSection(sectionName, { activate, reset, discardChanges });

  function bindEvents() {
    elements.form.addEventListener("submit", saveContent);
    elements.cancel.addEventListener("click", cancelChanges);
    elements.form.addEventListener("input", () => {
      api.setDirty(sectionName, true);
      updatePreview();
    });
    elements.image.addEventListener("change", handleImageChange);
    elements.previewImage.addEventListener("error", () => setPreviewImage(""));
  }

  async function activate() {
    if (!loaded) {
      await loadContent();
    }
  }

  async function loadContent() {
    if (!api.getClient()) {
      return;
    }
    setWorking(true, elements.save, "Загружаем…");
    try {
      const { data, error } = await api.getClient()
        .from("home_content")
        .select("id,hero_kicker,hero_title,hero_subtitle,hero_image_url,hero_image_path,about_title,about_text,created_at,updated_at")
        .eq("id", 1)
        .single();
      if (error) {
        throw error;
      }
      content = data;
      loaded = true;
      populateForm();
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось загрузить содержимое главной страницы."), "error");
    } finally {
      setWorking(false, elements.save, "Сохранить");
    }
  }

  function populateForm() {
    elements.form.reset();
    elements.kicker.value = content && content.hero_kicker ? content.hero_kicker : "";
    elements.title.value = content && content.hero_title ? content.hero_title : "";
    elements.subtitle.value = content && content.hero_subtitle ? content.hero_subtitle : "";
    elements.aboutTitle.value = content && content.about_title ? content.about_title : "";
    elements.aboutText.value = content && content.about_text ? content.about_text : "";
    clearPreviewObjectUrl();
    setPreviewImage(content && content.hero_image_url ? safeImageUrl(content.hero_image_url) : "");
    api.setDirty(sectionName, false);
    updatePreview();
  }

  function handleImageChange() {
    clearPreviewObjectUrl();
    const file = elements.image.files && elements.image.files[0];
    if (!file) {
      setPreviewImage(content && content.hero_image_url ? safeImageUrl(content.hero_image_url) : "");
      updatePreview();
      return;
    }
    const validationError = api.validateImage(file);
    if (validationError) {
      elements.image.value = "";
      setPreviewImage(content && content.hero_image_url ? safeImageUrl(content.hero_image_url) : "");
      api.showMessage(validationError, "error");
      return;
    }
    previewObjectUrl = URL.createObjectURL(file);
    setPreviewImage(previewObjectUrl);
    api.setDirty(sectionName, true);
  }

  function updatePreview() {
    elements.previewKicker.textContent = elements.kicker.value.trim() || "Надзаголовок";
    elements.previewTitle.textContent = elements.title.value.trim() || "Заголовок главного экрана";
    elements.previewSubtitle.textContent = elements.subtitle.value.trim() || "Подзаголовок появится здесь.";
  }

  function setPreviewImage(source) {
    if (source) {
      elements.previewImage.src = source;
      elements.previewImage.hidden = false;
      elements.previewPlaceholder.hidden = true;
    } else {
      elements.previewImage.removeAttribute("src");
      elements.previewImage.hidden = true;
      elements.previewPlaceholder.hidden = false;
    }
  }

  async function saveContent(event) {
    event.preventDefault();
    if (working || !content || !elements.form.reportValidity()) {
      return;
    }
    const selectedFile = elements.image.files && elements.image.files[0];
    if (selectedFile) {
      const validationError = api.validateImage(selectedFile);
      if (validationError) {
        api.showMessage(validationError, "error");
        return;
      }
    }

    setWorking(true, elements.save, "Сохраняем…");
    api.hideMessage();
    let uploadedPath = "";
    let imageUrl = content.hero_image_url || "";
    let imagePath = content.hero_image_path || null;

    try {
      if (selectedFile) {
        const prepared = await api.prepareImage(selectedFile, "hero-image");
        uploadedPath = api.createStoragePath("home", prepared.type);
        const { error: uploadError } = await api.getClient().storage.from(bucket).upload(uploadedPath, prepared, {
          cacheControl: "31536000",
          contentType: prepared.type,
          upsert: false
        });
        if (uploadError) {
          throw uploadError;
        }
        imageUrl = api.getPublicUrl(bucket, uploadedPath);
        imagePath = uploadedPath;
      }

      const payload = {
        hero_kicker: elements.kicker.value.trim(),
        hero_title: elements.title.value.trim(),
        hero_subtitle: elements.subtitle.value.trim(),
        hero_image_url: imageUrl,
        hero_image_path: imagePath,
        about_title: elements.aboutTitle.value.trim(),
        about_text: elements.aboutText.value.trim()
      };
      const { data, error } = await api.getClient()
        .from("home_content")
        .update(payload)
        .eq("id", 1)
        .select("id,hero_kicker,hero_title,hero_subtitle,hero_image_url,hero_image_path,about_title,about_text,created_at,updated_at")
        .single();
      if (error) {
        throw error;
      }

      const oldPath = content.hero_image_path;
      content = data;
      api.setDirty(sectionName, false);
      populateForm();

      if (uploadedPath && oldPath && oldPath !== uploadedPath) {
        const { error: removeError } = await api.getClient().storage.from(bucket).remove([oldPath]);
        if (removeError) {
          api.showMessage("Главная сохранена, но старое изображение не удалось удалить из хранилища.", "error");
          return;
        }
      }
      api.showMessage("Содержимое главной сохранено.", "success");
    } catch (error) {
      if (uploadedPath) {
        await api.getClient().storage.from(bucket).remove([uploadedPath]);
      }
      api.showMessage(api.readableError(error, "Не удалось сохранить содержимое главной."), "error");
    } finally {
      setWorking(false, elements.save, "Сохранить");
    }
  }

  function cancelChanges() {
    if (!api.confirmDiscard(sectionName)) {
      return;
    }
    populateForm();
  }

  function discardChanges() {
    if (content) {
      populateForm();
    } else {
      elements.form.reset();
      clearPreviewObjectUrl();
      setPreviewImage("");
      updatePreview();
      api.setDirty(sectionName, false);
    }
  }

  function clearPreviewObjectUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = "";
    }
  }

  function safeImageUrl(value) {
    if (!value) {
      return "";
    }
    try {
      const url = new URL(value, document.baseURI);
      return ["https:", "http:", "blob:", "data:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function setWorking(value, button, busyText) {
    working = value;
    api.setSectionBusy(sectionName, value);
    elements.form.querySelectorAll("button, input, textarea").forEach((control) => {
      control.disabled = value;
    });
    button.textContent = value ? busyText : "Сохранить";
  }

  function reset() {
    content = null;
    loaded = false;
    working = false;
    clearPreviewObjectUrl();
    elements.form.reset();
    setPreviewImage("");
    updatePreview();
    api.setDirty(sectionName, false);
  }
})();
