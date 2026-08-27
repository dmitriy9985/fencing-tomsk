(function () {
  "use strict";

  const newsGrid = document.querySelector("#news .grid-3");
  const config = window.SUPABASE_CONFIG;

  if (!newsGrid || !isConfigured(config) || !window.supabase) {
    return;
  }

  const client = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  loadNews();

  async function loadNews() {
    try {
      const { data, error } = await client
        .from("news")
        .select("id,title,date,date_label,summary,content,image_url,created_at")
        .eq("published", true)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      if (!Array.isArray(data)) {
        throw new Error("Получен некорректный ответ сервиса новостей.");
      }

      if (data.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "card news-empty-state";
        emptyState.textContent = "Пока нет опубликованных новостей.";
        newsGrid.replaceChildren(emptyState);
        return;
      }

      const fragment = document.createDocumentFragment();
      data.forEach((item, index) => fragment.append(createNewsCard(item, index)));
      newsGrid.replaceChildren(fragment);
    } catch (error) {
      // Статические карточки остаются в DOM и служат fallback.
      console.warn("Не удалось загрузить новости. Показаны сохранённые новости.", error);
    }
  }

  function createNewsCard(item, index) {
    const article = document.createElement("article");
    article.className = index === 0 ? "card photo-card" : "card";

    if (index === 0) {
      article.append(createFeatureImage(item));
      const body = document.createElement("div");
      appendNewsText(body, item);
      article.append(body);
    } else {
      article.append(createThumbnail(item));
      appendNewsText(article, item);
    }

    return article;
  }

  function createFeatureImage(item) {
    if (!item.image_url) {
      return createImagePlaceholder("news-feature-placeholder");
    }

    const image = document.createElement("img");
    image.src = resolveImageUrl(item.image_url);
    image.alt = item.title || "Фотография к новости";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder("news-feature-placeholder"));
    }, { once: true });
    return image;
  }

  function createThumbnail(item) {
    const thumbnail = document.createElement("div");
    thumbnail.className = "news-thumb";

    if (!item.image_url) {
      thumbnail.classList.add("image-missing");
      return thumbnail;
    }

    const image = document.createElement("img");
    image.src = resolveImageUrl(item.image_url);
    image.alt = item.title || "Фотография к новости";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
      thumbnail.classList.add("image-missing");
    }, { once: true });
    thumbnail.append(image);
    return thumbnail;
  }

  function createImagePlaceholder(className) {
    const placeholder = document.createElement("div");
    placeholder.className = className;
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  function appendNewsText(container, item) {
    const date = document.createElement("p");
    date.className = "date";
    date.textContent = item.date_label || formatDate(item.date);

    const title = document.createElement("h3");
    title.textContent = item.title || "Без заголовка";

    const summaryText = item.summary || item.content || "";
    const summary = document.createElement("p");
    summary.textContent = summaryText;

    container.append(date, title, summary);

    if (item.content && item.content.trim() !== summaryText.trim()) {
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

  function resolveImageUrl(value) {
    try {
      return new URL(value, document.baseURI).href;
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
})();
