(function () {
  "use strict";

  const sectionName = "gallery";
  const bucket = "gallery-images";
  const api = window.SiteAdmin;
  const elements = {
    addAlbum: document.getElementById("gallery-add-album-button"),
    refresh: document.getElementById("gallery-refresh-button"),
    albumList: document.getElementById("gallery-album-list"),
    albumEditor: document.getElementById("gallery-album-editor"),
    albumEditorTitle: document.getElementById("gallery-album-editor-title"),
    albumClose: document.getElementById("gallery-album-close-button"),
    albumForm: document.getElementById("gallery-album-form"),
    albumTitle: document.getElementById("gallery-album-title"),
    albumDescription: document.getElementById("gallery-album-description"),
    albumDate: document.getElementById("gallery-album-date"),
    albumOrder: document.getElementById("gallery-album-order"),
    albumPublished: document.getElementById("gallery-album-published"),
    albumSave: document.getElementById("gallery-album-save-button"),
    albumCancel: document.getElementById("gallery-album-cancel-button"),
    photosPanel: document.getElementById("gallery-photos-panel"),
    selectedTitle: document.getElementById("gallery-selected-title"),
    closeAlbum: document.getElementById("gallery-close-album-button"),
    uploadForm: document.getElementById("gallery-upload-form"),
    files: document.getElementById("gallery-files"),
    upload: document.getElementById("gallery-upload-button"),
    photoList: document.getElementById("gallery-photo-list"),
    photoEditor: document.getElementById("gallery-photo-editor"),
    photoClose: document.getElementById("gallery-photo-close-button"),
    photoForm: document.getElementById("gallery-photo-form"),
    photoCaption: document.getElementById("gallery-photo-caption"),
    photoAlt: document.getElementById("gallery-photo-alt"),
    photoOrder: document.getElementById("gallery-photo-order"),
    photoSave: document.getElementById("gallery-photo-save-button"),
    photoCancel: document.getElementById("gallery-photo-cancel-button")
  };

  let albums = [];
  let photos = [];
  let selectedAlbum = null;
  let editingAlbum = null;
  let editingPhoto = null;
  let loaded = false;
  let working = false;

  bindEvents();
  api.registerSection(sectionName, { activate, reset, discardChanges });

  function bindEvents() {
    elements.addAlbum.addEventListener("click", openCreateAlbum);
    elements.refresh.addEventListener("click", loadAlbums);
    elements.albumClose.addEventListener("click", () => closeAlbumEditor(true));
    elements.albumCancel.addEventListener("click", () => closeAlbumEditor(true));
    elements.albumForm.addEventListener("submit", saveAlbum);
    elements.albumForm.addEventListener("input", markDirtyIfAlbumEditorOpen);
    elements.closeAlbum.addEventListener("click", closeSelectedAlbum);
    elements.uploadForm.addEventListener("submit", uploadPhotos);
    elements.files.addEventListener("change", () => {
      if (elements.files.files.length > 0) {
        api.setDirty(sectionName, true);
      }
    });
    elements.photoClose.addEventListener("click", () => closePhotoEditor(true));
    elements.photoCancel.addEventListener("click", () => closePhotoEditor(true));
    elements.photoForm.addEventListener("submit", savePhoto);
    elements.photoForm.addEventListener("input", () => {
      if (!elements.photoEditor.hidden) {
        api.setDirty(sectionName, true);
      }
    });
  }

  async function activate() {
    if (!loaded) {
      await loadAlbums();
    }
  }

  async function loadAlbums() {
    const client = api.getClient();
    if (!client) {
      return;
    }
    elements.albumList.replaceChildren(api.createStateBlock("Загружаем альбомы…", "loading-state"));
    elements.refresh.disabled = true;
    try {
      const { data, error } = await client
        .from("gallery_albums")
        .select("id,title,description,event_date,published,sort_order,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) {
        throw error;
      }
      albums = Array.isArray(data) ? data : [];
      loaded = true;
      if (selectedAlbum) {
        selectedAlbum = albums.find((album) => String(album.id) === String(selectedAlbum.id)) || null;
        if (!selectedAlbum) {
          clearSelectedAlbum();
        } else {
          elements.selectedTitle.textContent = selectedAlbum.title;
        }
      }
      renderAlbums();
    } catch (error) {
      elements.albumList.replaceChildren(api.createStateBlock("Не удалось загрузить альбомы."));
      api.showMessage(api.readableError(error, "Не удалось загрузить альбомы."), "error");
    } finally {
      elements.refresh.disabled = false;
    }
  }

  function renderAlbums() {
    if (albums.length === 0) {
      elements.albumList.replaceChildren(api.createStateBlock("Альбомов пока нет. Нажмите «Создать альбом»."));
      return;
    }
    const fragment = document.createDocumentFragment();
    albums.forEach((album) => fragment.append(createAlbumRow(album)));
    elements.albumList.replaceChildren(fragment);
  }

  function createAlbumRow(album) {
    const row = api.createElement("article", { className: "record-row" });
    if (selectedAlbum && String(selectedAlbum.id) === String(album.id)) {
      row.classList.add("record-row-selected");
    }
    const content = api.createElement("div", { className: "record-row-content" });
    const metaText = [album.event_date ? api.formatDate(album.event_date) : "Без даты", `Порядок: ${album.sort_order}`].join(" · ");
    const meta = api.createElement("p", { className: "record-meta", text: metaText });
    const title = api.createElement("h3", { text: album.title });
    const description = api.createElement("p", {
      className: "record-summary",
      text: album.description || "Описание не указано"
    });
    content.append(meta, title, description, createStatus(album.published));

    const actions = api.createElement("div", { className: "record-actions" });
    actions.append(
      createButton("Открыть", "button button-primary button-small", () => openAlbum(album)),
      createButton(album.published ? "В черновик" : "Опубликовать", "button button-secondary button-small", () => toggleAlbumPublished(album)),
      createButton("Изменить", "button button-secondary button-small", () => openEditAlbum(album)),
      createButton("Удалить", "button button-danger button-small", () => deleteAlbum(album))
    );
    row.append(content, actions);
    return row;
  }

  function markDirtyIfAlbumEditorOpen() {
    if (!elements.albumEditor.hidden) {
      api.setDirty(sectionName, true);
    }
  }

  function openCreateAlbum() {
    if (!prepareForFormChange()) {
      return;
    }
    closePhotoEditor(false);
    editingAlbum = null;
    elements.albumForm.reset();
    elements.albumOrder.value = "0";
    elements.albumEditorTitle.textContent = "Новый альбом";
    elements.albumEditor.hidden = false;
    api.setDirty(sectionName, false);
    focusPanel(elements.albumEditor, elements.albumTitle);
  }

  function openEditAlbum(album) {
    if (!prepareForFormChange()) {
      return;
    }
    closePhotoEditor(false);
    editingAlbum = album;
    elements.albumForm.reset();
    elements.albumTitle.value = album.title || "";
    elements.albumDescription.value = album.description || "";
    elements.albumDate.value = album.event_date || "";
    elements.albumOrder.value = String(album.sort_order || 0);
    elements.albumPublished.checked = Boolean(album.published);
    elements.albumEditorTitle.textContent = "Изменение альбома";
    elements.albumEditor.hidden = false;
    api.setDirty(sectionName, false);
    focusPanel(elements.albumEditor, elements.albumTitle);
  }

  function prepareForFormChange() {
    return api.confirmDiscard(sectionName);
  }

  function closeAlbumEditor(ask) {
    if (ask && !api.confirmDiscard(sectionName)) {
      return;
    }
    editingAlbum = null;
    elements.albumEditor.hidden = true;
    elements.albumForm.reset();
    api.setDirty(sectionName, false);
  }

  async function saveAlbum(event) {
    event.preventDefault();
    if (working || !elements.albumForm.reportValidity()) {
      return;
    }
    if (!elements.albumTitle.value.trim()) {
      elements.albumTitle.setCustomValidity("Укажите название альбома.");
      elements.albumTitle.reportValidity();
      elements.albumTitle.setCustomValidity("");
      return;
    }
    const payload = {
      title: elements.albumTitle.value.trim(),
      description: elements.albumDescription.value.trim(),
      event_date: elements.albumDate.value || null,
      published: elements.albumPublished.checked,
      sort_order: Number(elements.albumOrder.value)
    };
    setWorking(true, elements.albumSave, "Сохраняем…");
    api.hideMessage();
    try {
      const query = editingAlbum
        ? api.getClient().from("gallery_albums").update(payload).eq("id", editingAlbum.id)
        : api.getClient().from("gallery_albums").insert(payload);
      const { data, error } = await query.select("id,title,description,event_date,published,sort_order,created_at,updated_at").single();
      if (error) {
        throw error;
      }
      if (selectedAlbum && editingAlbum && String(selectedAlbum.id) === String(editingAlbum.id)) {
        selectedAlbum = data;
        elements.selectedTitle.textContent = data.title;
      }
      api.setDirty(sectionName, false);
      closeAlbumEditor(false);
      await loadAlbums();
      api.showMessage("Альбом сохранён.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось сохранить альбом."), "error");
    } finally {
      setWorking(false, elements.albumSave, "Сохранить");
    }
  }

  async function toggleAlbumPublished(album) {
    if (working) {
      return;
    }
    setWorking(true);
    try {
      const { error } = await api.getClient().from("gallery_albums").update({ published: !album.published }).eq("id", album.id);
      if (error) {
        throw error;
      }
      await loadAlbums();
      api.showMessage(album.published ? "Альбом снят с публикации." : "Альбом опубликован.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось изменить публикацию альбома."), "error");
    } finally {
      setWorking(false);
    }
  }

  async function openAlbum(album) {
    if (!api.confirmDiscard(sectionName)) {
      return;
    }
    discardEditors();
    selectedAlbum = album;
    elements.selectedTitle.textContent = album.title;
    elements.photosPanel.hidden = false;
    renderAlbums();
    await loadPhotos();
    elements.photosPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadPhotos() {
    if (!selectedAlbum || !api.getClient()) {
      return;
    }
    elements.photoList.replaceChildren(api.createStateBlock("Загружаем фотографии…", "loading-state"));
    try {
      const { data, error } = await api.getClient()
        .from("gallery_photos")
        .select("id,album_id,image_url,image_path,caption,alt_text,sort_order,created_at,updated_at")
        .eq("album_id", selectedAlbum.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        throw error;
      }
      photos = Array.isArray(data) ? data : [];
      renderPhotos();
    } catch (error) {
      elements.photoList.replaceChildren(api.createStateBlock("Не удалось загрузить фотографии."));
      api.showMessage(api.readableError(error, "Не удалось загрузить фотографии."), "error");
    }
  }

  function renderPhotos() {
    if (photos.length === 0) {
      elements.photoList.replaceChildren(api.createStateBlock("В альбоме пока нет фотографий."));
      return;
    }
    const fragment = document.createDocumentFragment();
    photos.forEach((photo) => fragment.append(createPhotoCard(photo)));
    elements.photoList.replaceChildren(fragment);
  }

  function createPhotoCard(photo) {
    const card = api.createElement("article", { className: "photo-card" });
    const imageWrap = api.createElement("div", { className: "photo-card-image" });
    const source = safeImageUrl(photo.image_url);
    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = photo.alt_text || "";
      image.loading = "lazy";
      image.addEventListener("error", () => imageWrap.replaceChildren(api.createElement("span", { text: "Не удалось загрузить фото" })), { once: true });
      imageWrap.append(image);
    } else {
      imageWrap.textContent = "Нет изображения";
    }
    const content = api.createElement("div", { className: "photo-card-content" });
    content.append(
      api.createElement("p", { className: "photo-caption", text: photo.caption || "Без подписи" }),
      api.createElement("p", { className: "record-meta", text: `Порядок: ${photo.sort_order}` })
    );
    const actions = api.createElement("div", { className: "photo-card-actions" });
    actions.append(
      createButton("Изменить", "button button-secondary button-small", () => openPhotoEditor(photo)),
      createButton("Удалить", "button button-danger button-small", () => deletePhoto(photo))
    );
    content.append(actions);
    card.append(imageWrap, content);
    return card;
  }

  async function uploadPhotos(event) {
    event.preventDefault();
    if (working || !selectedAlbum || !elements.uploadForm.reportValidity()) {
      return;
    }
    const files = Array.from(elements.files.files || []);
    const validationError = files.map(api.validateImage).find(Boolean);
    if (validationError) {
      api.showMessage(validationError, "error");
      return;
    }

    setWorking(true, elements.upload, `Загружаем 0 из ${files.length}…`);
    api.hideMessage();
    let uploadedCount = 0;
    const failedNames = [];
    const initialOrder = photos.reduce((maximum, photo) => Math.max(maximum, Number(photo.sort_order) || 0), -1) + 1;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      let uploadedPath = "";
      elements.upload.textContent = `Загружаем ${index + 1} из ${files.length}…`;
      try {
        const prepared = await api.prepareImage(file, "gallery-image");
        uploadedPath = api.createStoragePath(`albums/${selectedAlbum.id}`, prepared.type);
        const { error: uploadError } = await api.getClient().storage.from(bucket).upload(uploadedPath, prepared, {
          cacheControl: "31536000",
          contentType: prepared.type,
          upsert: false
        });
        if (uploadError) {
          throw uploadError;
        }
        const payload = {
          album_id: selectedAlbum.id,
          image_url: api.getPublicUrl(bucket, uploadedPath),
          image_path: uploadedPath,
          caption: "",
          alt_text: "",
          sort_order: initialOrder + index
        };
        const { error: insertError } = await api.getClient().from("gallery_photos").insert(payload);
        if (insertError) {
          throw insertError;
        }
        uploadedCount += 1;
      } catch (error) {
        failedNames.push(file.name);
        if (uploadedPath) {
          await api.getClient().storage.from(bucket).remove([uploadedPath]);
        }
      }
    }

    elements.uploadForm.reset();
    api.setDirty(sectionName, false);
    await loadPhotos();
    setWorking(false, elements.upload, "Загрузить");
    if (failedNames.length > 0) {
      api.showMessage(`Загружено ${uploadedCount} из ${files.length}. Не удалось загрузить: ${failedNames.join(", ")}.`, "error");
    } else {
      api.showMessage(`Загружено фотографий: ${uploadedCount}.`, "success");
    }
  }

  function openPhotoEditor(photo) {
    if (!api.confirmDiscard(sectionName)) {
      return;
    }
    closeAlbumEditor(false);
    editingPhoto = photo;
    elements.photoForm.reset();
    elements.photoCaption.value = photo.caption || "";
    elements.photoAlt.value = photo.alt_text || "";
    elements.photoOrder.value = String(photo.sort_order || 0);
    elements.photoEditor.hidden = false;
    api.setDirty(sectionName, false);
    focusPanel(elements.photoEditor, elements.photoCaption);
  }

  function closePhotoEditor(ask) {
    if (ask && !api.confirmDiscard(sectionName)) {
      return;
    }
    editingPhoto = null;
    elements.photoEditor.hidden = true;
    elements.photoForm.reset();
    api.setDirty(sectionName, false);
  }

  async function savePhoto(event) {
    event.preventDefault();
    if (working || !editingPhoto || !elements.photoForm.reportValidity()) {
      return;
    }
    const payload = {
      caption: elements.photoCaption.value.trim(),
      alt_text: elements.photoAlt.value.trim(),
      sort_order: Number(elements.photoOrder.value)
    };
    setWorking(true, elements.photoSave, "Сохраняем…");
    try {
      const { error } = await api.getClient().from("gallery_photos").update(payload).eq("id", editingPhoto.id);
      if (error) {
        throw error;
      }
      api.setDirty(sectionName, false);
      closePhotoEditor(false);
      await loadPhotos();
      api.showMessage("Описание фотографии сохранено.", "success");
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось сохранить фотографию."), "error");
    } finally {
      setWorking(false, elements.photoSave, "Сохранить");
    }
  }

  async function deletePhoto(photo) {
    if (working || !window.confirm("Удалить эту фотографию? Это действие нельзя отменить.")) {
      return;
    }
    setWorking(true);
    try {
      const { error } = await api.getClient().from("gallery_photos").delete().eq("id", photo.id);
      if (error) {
        throw error;
      }
      let storageWarning = false;
      if (photo.image_path) {
        const { error: removeError } = await api.getClient().storage.from(bucket).remove([photo.image_path]);
        storageWarning = Boolean(removeError);
      }
      if (editingPhoto && String(editingPhoto.id) === String(photo.id)) {
        closePhotoEditor(false);
      }
      await loadPhotos();
      api.showMessage(
        storageWarning ? "Запись фотографии удалена, но файл не удалось удалить из хранилища." : "Фотография удалена.",
        storageWarning ? "error" : "success"
      );
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось удалить фотографию."), "error");
    } finally {
      setWorking(false);
    }
  }

  async function deleteAlbum(album) {
    if (working || !window.confirm(`Удалить альбом «${album.title}» и все его фотографии? Это действие нельзя отменить.`)) {
      return;
    }
    setWorking(true);
    api.hideMessage();
    let storageWarning = false;
    try {
      const { data: albumPhotos, error: photosError } = await api.getClient()
        .from("gallery_photos")
        .select("image_path")
        .eq("album_id", album.id);
      if (photosError) {
        throw photosError;
      }
      const paths = (albumPhotos || []).map((photo) => photo.image_path).filter(Boolean);
      if (paths.length > 0) {
        const { error: removeError } = await api.getClient().storage.from(bucket).remove(paths);
        storageWarning = Boolean(removeError);
      }

      const { error: deleteError } = await api.getClient().from("gallery_albums").delete().eq("id", album.id);
      if (deleteError) {
        if (!storageWarning && paths.length > 0) {
          throw new Error("Файлы удалены из хранилища, но альбом удалить не удалось. Обновите страницу и проверьте альбом.");
        }
        throw deleteError;
      }

      if (selectedAlbum && String(selectedAlbum.id) === String(album.id)) {
        clearSelectedAlbum();
      }
      if (editingAlbum && String(editingAlbum.id) === String(album.id)) {
        closeAlbumEditor(false);
      }
      await loadAlbums();
      api.showMessage(
        storageWarning ? "Альбом удалён, но часть файлов не удалось удалить из хранилища." : "Альбом удалён.",
        storageWarning ? "error" : "success"
      );
    } catch (error) {
      api.showMessage(api.readableError(error, "Не удалось удалить альбом."), "error");
    } finally {
      setWorking(false);
    }
  }

  function closeSelectedAlbum() {
    if (!api.confirmDiscard(sectionName)) {
      return;
    }
    clearSelectedAlbum();
    renderAlbums();
  }

  function clearSelectedAlbum() {
    selectedAlbum = null;
    photos = [];
    elements.photosPanel.hidden = true;
    elements.uploadForm.reset();
    elements.photoList.replaceChildren();
    closePhotoEditor(false);
  }

  function discardEditors() {
    editingAlbum = null;
    editingPhoto = null;
    elements.albumEditor.hidden = true;
    elements.photoEditor.hidden = true;
    elements.albumForm.reset();
    elements.photoForm.reset();
    elements.uploadForm.reset();
    api.setDirty(sectionName, false);
  }

  function discardChanges() {
    discardEditors();
  }

  function focusPanel(panel, field) {
    field.focus({ preventScroll: true });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createButton(text, className, handler) {
    const button = api.createElement("button", { text, className });
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  function createStatus(published) {
    return api.createElement("span", {
      className: published ? "status status-published" : "status status-draft",
      text: published ? "Опубликовано" : "Черновик"
    });
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
    document.querySelectorAll('[data-admin-section="gallery"] button').forEach((control) => {
      control.disabled = value;
    });
    if (button) {
      button.textContent = value ? busyText : button === elements.upload ? "Загрузить" : "Сохранить";
    }
  }

  function reset() {
    albums = [];
    photos = [];
    selectedAlbum = null;
    editingAlbum = null;
    editingPhoto = null;
    loaded = false;
    working = false;
    elements.albumList.replaceChildren();
    clearSelectedAlbum();
    closeAlbumEditor(false);
  }
})();
