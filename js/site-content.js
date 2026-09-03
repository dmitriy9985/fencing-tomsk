(function () {
  "use strict";

  const config = window.SUPABASE_CONFIG;

  if (!isConfigured(config) || !window.supabase || typeof window.supabase.createClient !== "function") {
    return;
  }

  const client = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const loaders = [];
  if (document.querySelector("#hero-kicker")) {
    loaders.push(loadHomeContent());
  }
  if (document.querySelector("#news-list")) {
    loaders.push(loadNews());
  }
  if (document.querySelector("#calendar-list")) {
    loaders.push(loadCalendar());
  }
  if (document.querySelector("#results-list")) {
    loaders.push(loadResults());
  }
  if (document.querySelector("#gallery-albums")) {
    loaders.push(loadGallery());
  }

  Promise.allSettled(loaders).then((results) => {
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.warn("Не удалось обновить один из разделов. Показан статический fallback.", result.reason);
      }
    });
  });

  async function loadHomeContent() {
    const result = await client
      .from("home_content")
      .select("id,hero_kicker,hero_title,hero_subtitle,hero_image_url,hero_image_alt,about_title,about_text")
      .eq("id", 1)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }
    if (!result.data) {
      renderEmptyHome();
      return;
    }

    const content = result.data;
    setText("#hero-kicker", content.hero_kicker);
    setHeroTitle(content.hero_title);
    setText("#hero-subtitle", content.hero_subtitle);
    setText("#about-title", content.about_title);
    setText("#about-text", content.about_text);

    if (content.hero_image_url && content.hero_image_url.trim()) {
      const image = document.querySelector("#hero-image");
      const fallbackSource = image.getAttribute("src");
      const fallbackAlt = image.alt;
      const resolvedUrl = resolveUrl(content.hero_image_url);

      if (resolvedUrl) {
        image.addEventListener("error", () => {
          image.src = fallbackSource;
          image.alt = fallbackAlt;
        }, { once: true });
        image.src = resolvedUrl;
        image.alt = content.hero_image_alt || "Главное изображение Федерации фехтования Томской области";
      }
    }
  }

  async function loadNews() {
    const container = document.querySelector("#news-list");
    const limit = parseLimit(container.dataset.limit);
    const preview = container.dataset.mode === "preview";
    let query = client
      .from("news")
      .select("id,title,date,date_label,summary,content,image_url,created_at")
      .eq("published", true)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }
    const result = await query;

    if (result.error) {
      throw result.error;
    }
    if (!Array.isArray(result.data)) {
      throw new Error("Получен некорректный ответ для новостей.");
    }

    if (result.data.length === 0) {
      container.replaceChildren(createEmptyState("Пока нет опубликованных новостей."));
      return;
    }

    const featured = createFeaturedNews(result.data[0], preview);
    if (result.data.length === 1) {
      container.classList.add("single");
      container.replaceChildren(featured);
      return;
    }

    const stream = document.createElement("div");
    stream.className = "news-stream";
    result.data.slice(1).forEach((item, index) => {
      stream.append(createNewsRow(item, index + 2, preview));
    });
    container.classList.remove("single");
    container.replaceChildren(featured, stream);
  }

  function createFeaturedNews(item, preview) {
    const article = document.createElement("article");
    article.className = "news-featured";

    const imageUrl = resolveUrl(item.image_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = item.title || "Фотография к новости";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.replaceWith(createImagePlaceholder("news-feature-placeholder"));
      }, { once: true });
      article.append(image);
    } else {
      article.append(createImagePlaceholder("news-feature-placeholder"));
    }

    const body = document.createElement("div");
    body.className = "news-featured-body";
    appendNewsContent(body, item, !preview);
    article.append(body);
    return article;
  }

  function createNewsRow(item, number, preview) {
    const article = document.createElement("article");
    article.className = "news-row";

    const content = document.createElement("div");
    content.className = "news-row-content";
    appendNewsContent(content, item, !preview);

    const arrow = createIcon("/images/icons/arrow-right.svg", "row-arrow");

    if (preview) {
      article.append(content, arrow);
    } else {
      const index = document.createElement("span");
      index.className = "editorial-number";
      index.textContent = String(number).padStart(2, "0");

      article.append(index, content);

      const imageUrl = resolveUrl(item.image_url);
      if (imageUrl) {
        const thumbnail = document.createElement("figure");
        thumbnail.className = "news-row-thumbnail";

        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = item.title || "Фотография к новости";
        image.loading = "lazy";
        image.addEventListener("error", () => {
          thumbnail.remove();
          article.classList.remove("has-thumbnail");
        }, { once: true });

        thumbnail.append(image);
        article.classList.add("has-thumbnail");
        article.append(thumbnail);
      }

      article.append(arrow);
    }
    return article;
  }

  function appendNewsContent(container, item, allowDetails) {
    const time = document.createElement("time");
    if (item.date) {
      time.dateTime = item.date;
    }
    time.textContent = item.date_label || formatLongDate(item.date);

    const title = document.createElement("h3");
    title.textContent = item.title || "Без заголовка";

    const summaryText = (item.summary || item.content || "").trim();
    const summary = document.createElement("p");
    summary.textContent = summaryText;
    container.append(time, title, summary);

    if (allowDetails && item.content && item.content.trim() && item.content.trim() !== summaryText) {
      const details = document.createElement("details");
      details.className = "news-details";
      const toggle = document.createElement("summary");
      toggle.textContent = "Читать полностью";
      const fullText = document.createElement("p");
      fullText.textContent = item.content;
      details.append(toggle, fullText);
      container.append(details);
    }
  }

  async function loadCalendar() {
    const container = document.querySelector("#calendar-list");
    const limit = parseLimit(container.dataset.limit);
    let query = client
      .from("competition_events")
      .select("id,title,start_date,end_date,location,description,category_label,short_label,created_at")
      .eq("published", true)
      .order("start_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }
    const result = await query;

    if (result.error) {
      throw result.error;
    }
    if (!Array.isArray(result.data)) {
      throw new Error("Получен некорректный ответ для календаря.");
    }

    if (result.data.length === 0) {
      container.replaceChildren(createEmptyState("Пока нет опубликованных событий."));
      return;
    }

    const fragment = document.createDocumentFragment();
    result.data.forEach((item) => fragment.append(createEvent(item)));
    container.replaceChildren(fragment);
  }

  function createEvent(item) {
    const article = document.createElement("article");
    article.className = "event-row";

    const date = document.createElement("div");
    date.className = "event-date";
    const dateParts = eventDateParts(item.start_date, item.end_date);
    const range = document.createElement("span");
    range.textContent = dateParts.range;
    const month = document.createElement("b");
    month.textContent = dateParts.month;
    const year = document.createElement("small");
    year.textContent = dateParts.year;
    date.append(range, month, year);

    const main = document.createElement("div");
    main.className = "event-main";
    const category = document.createElement("p");
    category.className = "event-category";
    category.textContent = item.category_label || "Соревнование";
    const title = document.createElement("h3");
    title.textContent = item.title || "Без названия";
    const meta = document.createElement("div");
    meta.className = "event-meta";
    if (item.location) {
      const location = document.createElement("span");
      location.textContent = item.location;
      meta.append(location);
    }
    if (item.description) {
      const description = document.createElement("span");
      description.textContent = item.description;
      meta.append(description);
    }
    main.append(category, title, meta);

    const code = document.createElement("div");
    code.className = "event-code";
    if (item.short_label) {
      code.textContent = item.short_label;
    } else {
      code.append(createIcon("/images/icons/arrow-right.svg", "event-arrow"));
    }
    article.append(date, main, code);
    return article;
  }

  async function loadResults() {
    const result = await client
      .from("competition_results")
      .select("id,competition_date,date_label,title,result_text,category,created_at")
      .eq("published", true)
      .order("competition_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (result.error) {
      throw result.error;
    }
    if (!Array.isArray(result.data)) {
      throw new Error("Получен некорректный ответ для результатов.");
    }

    const container = document.querySelector("#results-list");
    if (result.data.length === 0) {
      container.replaceChildren(createEmptyState("Пока нет опубликованных результатов."));
      return;
    }

    const fragment = document.createDocumentFragment();
    result.data.forEach((item, index) => fragment.append(createResult(item, index + 1)));
    container.replaceChildren(fragment);
  }

  function createResult(item, number) {
    const article = document.createElement("article");
    article.className = "result-row";

    const index = document.createElement("span");
    index.className = "editorial-number";
    index.textContent = String(number).padStart(2, "0");

    const time = document.createElement("time");
    if (item.competition_date) {
      time.dateTime = item.competition_date;
    }
    time.textContent = item.date_label || formatNumericDate(item.competition_date);

    const main = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.title || "Без названия";
    const resultText = document.createElement("p");
    resultText.textContent = item.result_text || "";
    main.append(title, resultText);

    const category = document.createElement("span");
    category.className = "result-category";
    category.textContent = item.category || "";
    article.append(index, time, main, category);
    return article;
  }

  async function loadGallery() {
    const albumsResult = await client
      .from("gallery_albums")
      .select("id,title,description,event_date,sort_order,created_at")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (albumsResult.error) {
      throw albumsResult.error;
    }
    if (!Array.isArray(albumsResult.data)) {
      throw new Error("Получен некорректный ответ для альбомов.");
    }

    const container = document.querySelector("#gallery-albums");
    if (albumsResult.data.length === 0) {
      container.replaceChildren(createEmptyState("Пока нет опубликованных альбомов."));
      return;
    }

    const albumIds = albumsResult.data.map((album) => album.id);
    const photosResult = await client
      .from("gallery_photos")
      .select("id,album_id,image_url,caption,alt_text,sort_order,created_at")
      .in("album_id", albumIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (photosResult.error) {
      throw photosResult.error;
    }
    if (!Array.isArray(photosResult.data)) {
      throw new Error("Получен некорректный ответ для фотографий.");
    }

    const fragment = document.createDocumentFragment();
    albumsResult.data.forEach((album) => {
      const photos = photosResult.data.filter((photo) => photo.album_id === album.id);
      fragment.append(createAlbum(album, photos));
    });
    container.replaceChildren(fragment);
  }

  function createAlbum(album, photos) {
    const section = document.createElement("section");
    section.className = "gallery-album";
    section.setAttribute("aria-label", album.title || "Фотоальбом");

    const heading = document.createElement("div");
    heading.className = "gallery-album-heading";
    const title = document.createElement("h3");
    title.textContent = album.title || "Фотоальбом";
    heading.append(title);

    if (album.description || album.event_date) {
      const description = document.createElement("p");
      description.textContent = [album.description, formatLongDate(album.event_date)].filter(Boolean).join(" • ");
      heading.append(description);
    }
    section.append(heading);

    if (photos.length === 0) {
      section.append(createEmptyState("В этом альбоме пока нет фотографий."));
      return section;
    }

    const grid = document.createElement("div");
    grid.className = "gallery-grid";
    photos.forEach((photo, index) => grid.append(createPhoto(photo, album.title, index === 0)));
    section.append(grid);
    return section;
  }

  function createPhoto(photo, albumTitle, featured) {
    const figure = document.createElement("figure");
    figure.className = featured ? "gallery-photo gallery-featured" : "gallery-photo";

    const imageUrl = resolveUrl(photo.image_url);
    const image = document.createElement("img");
    image.alt = photo.alt_text || photo.caption || albumTitle || "Фотография из галереи";
    image.loading = "lazy";
    if (imageUrl) {
      image.src = imageUrl;
      image.addEventListener("error", () => figure.classList.add("image-error"), { once: true });
    } else {
      figure.classList.add("image-error");
    }

    const caption = document.createElement("figcaption");
    caption.textContent = photo.caption || photo.alt_text || albumTitle || "";
    figure.append(image, caption);
    return figure;
  }

  function renderEmptyHome() {
    setText("#hero-kicker", "");
    setHeroTitle("Главная страница");
    setText("#hero-subtitle", "Контент главной страницы пока не опубликован.");
    setText("#about-title", "О федерации");
    setText("#about-text", "Контент раздела пока не опубликован.");
  }

  function setHeroTitle(value) {
    const title = String(value || "").trim();
    const match = title.match(/^(.*?)\s+(в\s+Томске)$/i);
    const primary = document.querySelector("#hero-title-primary");
    const secondary = document.querySelector("#hero-title-secondary");
    primary.textContent = match ? match[1] : title;
    secondary.textContent = match ? match[2] : "";
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = value || "";
    }
  }

  function createEmptyState(message) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  function createIcon(source, className) {
    const icon = document.createElement("img");
    icon.src = source;
    icon.alt = "";
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function parseLimit(value) {
    const limit = Number.parseInt(value || "", 10);
    return Number.isInteger(limit) && limit > 0 ? limit : 0;
  }

  function createImagePlaceholder(className) {
    const placeholder = document.createElement("div");
    placeholder.className = className;
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  function resolveUrl(value) {
    if (!value) {
      return "";
    }
    try {
      const url = new URL(value, document.baseURI);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function parseDate(value) {
    if (!value) {
      return null;
    }
    const date = new Date(value + "T00:00:00Z");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatLongDate(value) {
    const date = parseDate(value);
    if (!date) {
      return value || "";
    }
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function formatNumericDate(value) {
    const date = parseDate(value);
    if (!date) {
      return value || "";
    }
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function eventDateParts(startValue, endValue) {
    const start = parseDate(startValue);
    const end = parseDate(endValue) || start;
    if (!start || !end) {
      return { range: "—", month: "дата", year: "" };
    }

    const startDay = String(start.getUTCDate()).padStart(2, "0");
    const endDay = String(end.getUTCDate()).padStart(2, "0");
    const sameMonth = start.getUTCMonth() === end.getUTCMonth()
      && start.getUTCFullYear() === end.getUTCFullYear();
    const months = [
      "январь", "февраль", "март", "апрель", "май", "июнь",
      "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
    ];

    if (sameMonth) {
      return {
        range: startDay === endDay ? startDay : startDay + "–" + endDay,
        month: months[start.getUTCMonth()],
        year: String(start.getUTCFullYear())
      };
    }

    return {
      range: startDay + "." + String(start.getUTCMonth() + 1).padStart(2, "0")
        + "–" + endDay + "." + String(end.getUTCMonth() + 1).padStart(2, "0"),
      month: "период",
      year: start.getUTCFullYear() === end.getUTCFullYear()
        ? String(start.getUTCFullYear())
        : String(start.getUTCFullYear()) + "–" + String(end.getUTCFullYear())
    };
  }

  function isConfigured(value) {
    return Boolean(
      value
      && typeof value.url === "string"
      && typeof value.anonKey === "string"
      && value.url.startsWith("https://")
      && !value.url.includes("YOUR_SUPABASE")
      && value.anonKey.length > 20
      && !value.anonKey.includes("YOUR_SUPABASE")
    );
  }
}());
