(function () {
  "use strict";

  const PAGE_SIZE = 6;
  const container = document.querySelector("#news-list[data-mode='full']");
  const detailContainer = document.querySelector("#news-detail");
  const config = window.SUPABASE_CONFIG;
  const requestedId = new URLSearchParams(window.location.search).get("id");

  if (!container || !detailContainer) {
    return;
  }

  if (requestedId !== null) {
    enterDetailMode();
  } else {
    enterListMode();
  }

  if (!isConfigured(config)
    || !window.supabase || typeof window.supabase.createClient !== "function") {
    if (requestedId !== null) {
      renderDetailError();
    }
    return;
  }

  const client = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  let archiveGrid = null;
  let loadMoreButton = null;
  let nextArchiveOffset = 0;
  let loadingMore = false;

  start(requestedId);

  async function start(newsId) {
    try {
      if (newsId !== null) {
        await loadNewsDetail(newsId);
      } else {
        await loadNewsArchive();
      }
    } catch (error) {
      if (newsId !== null) {
        renderDetailError();
        console.warn("Не удалось загрузить полную новость.", error);
      } else {
        // До успешного ответа статическая лента остаётся полезным fallback.
        console.warn("Не удалось загрузить новости. Показан статический fallback.", error);
      }
    }
  }

  function enterListMode() {
    document.body.classList.remove("news-detail-mode");
    container.hidden = false;
    detailContainer.hidden = true;
  }

  function enterDetailMode() {
    document.body.classList.add("news-detail-mode");
    container.hidden = true;
    detailContainer.hidden = false;
    detailContainer.replaceChildren(
      createEmptyState("Загружаем новость…", "news-detail-loading")
    );
    window.scrollTo(0, 0);
  }

  async function loadNewsArchive() {
    const result = await fetchNewsRange(0, PAGE_SIZE + 1);
    if (result.length === 0) {
      container.replaceChildren(createEmptyState("Пока нет опубликованных новостей."));
      return;
    }

    const featured = createFeaturedNews(result[0]);
    const archiveItems = result.slice(1, PAGE_SIZE + 1);
    const fragment = document.createDocumentFragment();
    fragment.append(featured);

    if (archiveItems.length > 0) {
      const archive = document.createElement("section");
      archive.className = "news-archive";

      const heading = document.createElement("div");
      heading.className = "news-archive-heading";
      const eyebrow = document.createElement("p");
      eyebrow.className = "kicker kicker-light";
      eyebrow.textContent = "Архив федерации";
      const title = document.createElement("h2");
      title.textContent = "Другие новости";
      heading.append(eyebrow, title);

      archiveGrid = document.createElement("div");
      archiveGrid.className = "news-archive-grid";
      archiveItems.forEach((item) => archiveGrid.append(createNewsCard(item)));
      archive.append(heading, archiveGrid);
      fragment.append(archive);
    }

    const hasMore = result.length > PAGE_SIZE + 1;
    nextArchiveOffset = PAGE_SIZE + 1;
    if (hasMore) {
      const loadMoreWrap = document.createElement("div");
      loadMoreWrap.className = "news-load-more-wrap";
      loadMoreButton = createLoadMoreButton();
      loadMoreWrap.append(loadMoreButton);
      fragment.append(loadMoreWrap);
    }

    container.replaceChildren(fragment);
  }

  async function loadMoreNews() {
    if (loadingMore || !archiveGrid || !loadMoreButton) {
      return;
    }

    loadingMore = true;
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = "Загружаем…";

    try {
      const result = await fetchNewsRange(nextArchiveOffset, nextArchiveOffset + PAGE_SIZE);
      const nextItems = result.slice(0, PAGE_SIZE);
      nextItems.forEach((item) => archiveGrid.append(createNewsCard(item)));
      nextArchiveOffset += nextItems.length;

      if (result.length <= PAGE_SIZE || nextItems.length === 0) {
        loadMoreButton.parentElement.remove();
        loadMoreButton = null;
      } else {
        loadMoreButton.disabled = false;
        loadMoreButton.textContent = "Показать ещё";
      }
    } catch (error) {
      loadMoreButton.disabled = false;
      loadMoreButton.textContent = "Повторить загрузку";
      console.warn("Не удалось загрузить следующую страницу новостей.", error);
    } finally {
      loadingMore = false;
    }
  }

  async function fetchNewsRange(from, to) {
    const result = await client
      .from("news")
      .select("id,title,date,date_label,summary,content,image_url,created_at")
      .eq("published", true)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (result.error) {
      throw result.error;
    }
    if (!Array.isArray(result.data)) {
      throw new Error("Получен некорректный ответ для новостей.");
    }
    return result.data;
  }

  async function loadNewsDetail(rawId) {
    if (!/^\d+$/.test(rawId) || Number(rawId) < 1) {
      renderNotFound();
      return;
    }

    const newsResult = await client
      .from("news")
      .select("id,title,date,date_label,summary,content,image_url,created_at")
      .eq("published", true)
      .eq("id", rawId)
      .maybeSingle();

    if (newsResult.error) {
      throw newsResult.error;
    }
    if (!newsResult.data) {
      renderNotFound();
      return;
    }

    let photos = [];
    try {
      const photoResult = await client
        .from("news_photos")
        .select("id,news_id,image_url,image_path,caption,alt_text,sort_order,created_at")
        .eq("news_id", rawId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (photoResult.error) {
        throw photoResult.error;
      }
      photos = Array.isArray(photoResult.data) ? photoResult.data : [];
    } catch (error) {
      // Основной материал остаётся доступным, даже если фотогалерея временно недоступна.
      console.warn("Не удалось загрузить дополнительные фотографии новости.", error);
    }

    renderNewsDetail(newsResult.data, photos);
  }

  function createFeaturedNews(item) {
    const article = document.createElement("article");
    article.className = "news-page-featured";

    const media = document.createElement("figure");
    media.className = "news-page-featured-media";
    appendCover(media, item, false);

    const body = document.createElement("div");
    body.className = "news-page-featured-body";
    body.append(createNewsTime(item));

    const title = document.createElement("h2");
    title.textContent = item.title || "Без заголовка";
    const summary = document.createElement("p");
    summary.textContent = newsSummary(item);
    body.append(title, summary, createReadLink(item.id));

    article.append(media, body);
    return article;
  }

  function createNewsCard(item) {
    const article = document.createElement("article");
    article.className = "news-card";

    const media = document.createElement("figure");
    media.className = "news-card-media";
    appendCover(media, item, true);

    const body = document.createElement("div");
    body.className = "news-card-body";
    body.append(createNewsTime(item));

    const title = document.createElement("h3");
    title.textContent = item.title || "Без заголовка";
    const summary = document.createElement("p");
    summary.textContent = newsSummary(item);
    body.append(title, summary, createReadLink(item.id));

    article.append(media, body);
    return article;
  }

  function appendCover(containerElement, item, lazy) {
    const imageUrl = resolveUrl(item.image_url);
    if (!imageUrl) {
      containerElement.append(createImagePlaceholder("news-cover-placeholder"));
      return;
    }

    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = item.title || "Фотография к новости";
    image.loading = lazy ? "lazy" : "eager";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder("news-cover-placeholder"));
    }, { once: true });
    containerElement.append(image);
  }

  function createNewsTime(item) {
    const time = document.createElement("time");
    if (item.date) {
      time.dateTime = item.date;
    }
    time.textContent = item.date_label || formatLongDate(item.date);
    return time;
  }

  function createReadLink(id) {
    const link = document.createElement("a");
    link.className = "news-read-link";
    link.href = `/news/?id=${encodeURIComponent(String(id))}`;
    const label = document.createElement("span");
    label.textContent = "Читать полностью";
    const arrow = document.createElement("img");
    arrow.src = "/images/icons/arrow-right.svg";
    arrow.alt = "";
    arrow.setAttribute("aria-hidden", "true");
    link.append(label, arrow);
    return link;
  }

  function createLoadMoreButton() {
    const button = document.createElement("button");
    button.className = "button news-load-more";
    button.type = "button";
    button.textContent = "Показать ещё";
    button.addEventListener("click", loadMoreNews);
    return button;
  }

  function renderNewsDetail(item, photos) {
    const article = document.createElement("article");
    article.className = "news-detail-article";

    const back = createBackLink();
    const header = document.createElement("header");
    header.className = "news-detail-header";
    header.append(createNewsTime(item));

    const title = document.createElement("h1");
    title.textContent = item.title || "Без заголовка";
    const summary = document.createElement("p");
    summary.className = "news-detail-summary";
    summary.textContent = newsSummary(item);
    header.append(title, summary);

    const cover = document.createElement("figure");
    cover.className = "news-detail-cover";
    appendCover(cover, item, false);

    const content = document.createElement("div");
    content.className = "news-detail-content";
    appendTextParagraphs(content, item.content || item.summary || "");

    article.append(back, header, cover, content);
    if (photos.length > 0) {
      article.append(createAdditionalGallery(item, photos));
    }

    container.hidden = true;
    detailContainer.replaceChildren(article);
    detailContainer.hidden = false;
    document.title = `${item.title || "Новость"} · Федерация фехтования Томской области`;
  }

  function createAdditionalGallery(item, photos) {
    const section = document.createElement("section");
    section.className = "news-detail-gallery";
    const title = document.createElement("h2");
    title.textContent = "Фотографии";

    const grid = document.createElement("div");
    grid.className = `news-detail-photo-grid photo-count-${Math.min(photos.length, 10)}`;
    photos.forEach((photo) => {
      const figure = document.createElement("figure");
      figure.className = "news-detail-photo";

      const imageUrl = resolveUrl(photo.image_url);
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = photo.alt_text || photo.caption || item.title || "Дополнительная фотография";
        image.loading = "lazy";
        image.addEventListener("error", () => {
          image.replaceWith(createImagePlaceholder("news-detail-photo-placeholder"));
        }, { once: true });
        figure.append(image);
      } else {
        figure.append(createImagePlaceholder("news-detail-photo-placeholder"));
      }

      if (photo.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = photo.caption;
        figure.append(caption);
      }
      grid.append(figure);
    });

    section.append(title, grid);
    return section;
  }

  function appendTextParagraphs(containerElement, value) {
    const chunks = String(value || "").trim().split(/\n\s*\n/).filter(Boolean);
    if (chunks.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Полный текст новости пока не добавлен.";
      containerElement.append(empty);
      return;
    }
    chunks.forEach((chunk) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = chunk.trim();
      containerElement.append(paragraph);
    });
  }

  function renderNotFound() {
    const state = document.createElement("div");
    state.className = "news-not-found";
    const kicker = document.createElement("p");
    kicker.className = "kicker kicker-light";
    kicker.textContent = "Архив федерации";
    const title = document.createElement("h1");
    title.textContent = "Новость не найдена";
    const text = document.createElement("p");
    text.textContent = "Возможно, материал был снят с публикации или адрес указан неверно.";
    state.append(kicker, title, text, createBackLink());

    container.hidden = true;
    detailContainer.replaceChildren(state);
    detailContainer.hidden = false;
    document.title = "Новость не найдена · Федерация фехтования Томской области";
  }

  function renderDetailError() {
    const state = document.createElement("div");
    state.className = "news-not-found";
    const kicker = document.createElement("p");
    kicker.className = "kicker kicker-light";
    kicker.textContent = "Архив федерации";
    const title = document.createElement("h1");
    title.textContent = "Не удалось загрузить новость";
    const text = document.createElement("p");
    text.textContent = "Проверьте подключение к интернету и попробуйте открыть материал ещё раз.";
    state.append(kicker, title, text, createBackLink());

    container.hidden = true;
    detailContainer.replaceChildren(state);
    detailContainer.hidden = false;
  }

  function createBackLink() {
    const link = document.createElement("a");
    link.className = "news-back-link";
    link.href = "/news/";
    link.textContent = "← Все новости";
    return link;
  }

  function newsSummary(item) {
    return String(item.summary || item.content || "").trim();
  }

  function createEmptyState(message, extraClass) {
    const state = document.createElement("p");
    state.className = `empty-state${extraClass ? ` ${extraClass}` : ""}`;
    state.textContent = message;
    return state;
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

  function formatLongDate(value) {
    if (!value) {
      return "";
    }
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
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
