(function () {
  "use strict";

  const MAX_SOURCE_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 1920;
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const sections = new Map();
  const dirtySections = new Set();
  const busySections = new Set();

  let client = null;
  let user = null;

  window.SiteAdmin = Object.freeze({
    registerSection,
    setSession,
    clearSession,
    activateSection,
    discardSection,
    setDirty,
    setSectionBusy,
    isDirty,
    confirmDiscard,
    getClient: () => client,
    getUser: () => user,
    showMessage,
    hideMessage,
    readableError,
    formatDate,
    todayAsInputValue,
    createElement,
    createStateBlock,
    validateImage,
    prepareImage,
    createStoragePath,
    getPublicUrl
  });

  window.addEventListener("beforeunload", (event) => {
    if (dirtySections.size > 0 || busySections.size > 0) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  function registerSection(name, module) {
    sections.set(name, module || {});
  }

  function setSession(nextClient, nextUser) {
    client = nextClient;
    user = nextUser;
  }

  function clearSession() {
    sections.forEach((module) => {
      if (typeof module.reset === "function") {
        module.reset();
      }
    });
    dirtySections.clear();
    busySections.clear();
    client = null;
    user = null;
  }

  async function activateSection(name) {
    const module = sections.get(name);
    if (!module || typeof module.activate !== "function" || !client || !user) {
      return;
    }

    try {
      await module.activate({ client, user });
    } catch (error) {
      showMessage(readableError(error, "Не удалось открыть раздел."), "error");
    }
  }

  function discardSection(name) {
    const module = sections.get(name);
    dirtySections.delete(name);
    if (module && typeof module.discardChanges === "function") {
      module.discardChanges();
    }
  }

  function setDirty(name, value) {
    if (value) {
      dirtySections.add(name);
    } else {
      dirtySections.delete(name);
    }
  }

  function isDirty(name) {
    return dirtySections.has(name);
  }

  function setSectionBusy(name, value) {
    if (value) {
      busySections.add(name);
    } else {
      busySections.delete(name);
    }
  }

  function confirmDiscard(name) {
    if (busySections.has(name)) {
      window.alert("Дождитесь завершения текущей операции.");
      return false;
    }
    if (!isDirty(name)) {
      return true;
    }

    const confirmed = window.confirm("Есть несохранённые изменения. Уйти без сохранения?");
    if (confirmed) {
      dirtySections.delete(name);
    }
    return confirmed;
  }

  function showMessage(text, type) {
    const message = document.getElementById("message");
    if (!message) {
      return;
    }
    message.textContent = text;
    message.className = `message ${type || ""}`.trim();
    message.hidden = false;
    message.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideMessage() {
    const message = document.getElementById("message");
    if (!message) {
      return;
    }
    message.hidden = true;
    message.textContent = "";
    message.className = "message";
  }

  function readableError(error, fallback) {
    if (!error || typeof error.message !== "string") {
      return fallback;
    }

    const normalized = error.message.toLowerCase();
    if (normalized.includes("row-level security") || normalized.includes("permission denied")) {
      return "Операция запрещена политиками безопасности. Проверьте доступ администратора.";
    }
    if (normalized.includes("failed to fetch") || normalized.includes("network")) {
      return "Нет связи с Supabase. Проверьте интернет и повторите попытку.";
    }
    if (normalized.includes("duplicate key")) {
      return "Такая запись уже существует. Обновите список и повторите попытку.";
    }
    return error.message || fallback;
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

  function createElement(tagName, options) {
    const element = document.createElement(tagName);
    const settings = options || {};
    if (settings.className) {
      element.className = settings.className;
    }
    if (settings.text !== undefined) {
      element.textContent = settings.text;
    }
    return element;
  }

  function createStateBlock(text, className) {
    return createElement("div", { text, className: className || "empty-state" });
  }

  function validateImage(file) {
    if (!file || !ALLOWED_IMAGE_TYPES.has(file.type)) {
      return "Разрешены только изображения JPG, JPEG, PNG и WEBP.";
    }
    if (file.size > MAX_SOURCE_FILE_SIZE) {
      return "Файл слишком большой. Выберите изображение размером не более 10 МБ.";
    }
    return "";
  }

  async function prepareImage(file, baseName) {
    const validationError = validateImage(file);
    if (validationError) {
      throw new Error(validationError);
    }

    const image = await loadLocalImage(file);
    const initialScale = Math.min(1, MAX_IMAGE_SIDE / image.naturalWidth, MAX_IMAGE_SIDE / image.naturalHeight);
    if (initialScale === 1 && file.size <= MAX_UPLOAD_FILE_SIZE) {
      return file;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Браузер не смог подготовить изображение.");
    }

    let outputType = file.type;
    let quality = outputType === "image/png" ? undefined : 0.88;
    let scale = initialScale;
    let blob = null;

    for (let attempt = 0; attempt < 9; attempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, outputType, quality);

      if (blob.size <= MAX_UPLOAD_FILE_SIZE) {
        break;
      }

      if (outputType === "image/png") {
        outputType = "image/webp";
        quality = 0.88;
      } else {
        quality = Math.max(0.56, quality - 0.08);
        scale *= 0.88;
      }
    }

    if (!blob || blob.size > MAX_UPLOAD_FILE_SIZE) {
      throw new Error("После уменьшения фотография всё ещё больше 5 МБ. Выберите другой файл.");
    }

    return new File([blob], `${baseName || "image"}.${extensionForType(outputType)}`, {
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

  function createStoragePath(folder, type) {
    if (!user) {
      throw new Error("Сессия администратора завершена. Войдите снова.");
    }
    const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${user.id}/${folder}/${Date.now()}-${randomPart}.${extensionForType(type)}`;
  }

  function getPublicUrl(bucket, path) {
    if (!client) {
      return "";
    }
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return data && data.publicUrl ? data.publicUrl : "";
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
})();
