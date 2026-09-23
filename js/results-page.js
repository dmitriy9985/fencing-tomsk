(function () {
  "use strict";

  const container = document.getElementById("results-list");
  const filters = document.getElementById("results-filters");
  const yearSelect = document.getElementById("results-year");
  const weaponSelect = document.getElementById("results-weapon");
  const resetButton = document.getElementById("results-reset");
  const count = document.getElementById("results-count");
  let results = [];

  if (!container || !filters || !yearSelect || !weaponSelect || !resetButton || !count) {
    return;
  }

  filters.addEventListener("change", renderResults);
  resetButton.addEventListener("click", () => {
    yearSelect.value = "";
    weaponSelect.value = "";
    renderResults();
  });

  loadResults();

  async function loadResults() {
    if (!window.supabase || !window.SUPABASE_CONFIG) {
      showFallbackNotice();
      return;
    }

    const client = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );

    const { data, error } = await client
      .from("competition_results")
      .select(`
        id,
        competition_date,
        date_label,
        title,
        result_text,
        category,
        city,
        protocol_url,
        created_at,
        event:competition_events(id,title,location),
        news:news(id,title),
        entries:competition_result_entries(
          id,
          place,
          participant_name,
          weapon,
          age_category,
          competition_format,
          team_members,
          sort_order,
          created_at
        )
      `)
      .eq("published", true)
      .order("competition_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error || !Array.isArray(data)) {
      showFallbackNotice();
      return;
    }

    results = data.map(normalizeResult);
    populateFilters();
    renderResults();
  }

  function normalizeResult(item) {
    const entries = Array.isArray(item.entries) ? [...item.entries] : [];
    entries.sort((left, right) => (
      numberValue(left.sort_order) - numberValue(right.sort_order)
      || numberValue(left.place) - numberValue(right.place)
      || String(left.participant_name || "").localeCompare(String(right.participant_name || ""), "ru")
    ));
    return { ...item, entries };
  }

  function populateFilters() {
    const years = uniqueSorted(results.map((item) => String(item.competition_date || "").slice(0, 4)).filter(Boolean), true);
    const weapons = uniqueSorted(results.flatMap((item) => item.entries.map((entry) => entry.weapon).filter(Boolean)), false);
    replaceOptions(yearSelect, "Все годы", years);
    replaceOptions(weaponSelect, "Все дисциплины", weapons);
  }

  function replaceOptions(select, defaultLabel, values) {
    const currentValue = select.value;
    const fragment = document.createDocumentFragment();
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = defaultLabel;
    fragment.append(defaultOption);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      fragment.append(option);
    });
    select.replaceChildren(fragment);
    select.value = values.includes(currentValue) ? currentValue : "";
  }

  function renderResults() {
    const selectedYear = yearSelect.value;
    const selectedWeapon = weaponSelect.value;
    const filtered = results.filter((item) => {
      const matchesYear = !selectedYear || String(item.competition_date || "").startsWith(selectedYear);
      const matchesWeapon = !selectedWeapon || item.entries.some((entry) => entry.weapon === selectedWeapon);
      return matchesYear && matchesWeapon;
    });

    resetButton.hidden = !selectedYear && !selectedWeapon;
    count.textContent = resultCountText(filtered.length);

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state results-empty";
      empty.textContent = results.length === 0
        ? "Пока нет опубликованных результатов."
        : "По выбранным фильтрам результатов нет.";
      container.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((item) => fragment.append(createTournament(item, selectedWeapon)));
    container.replaceChildren(fragment);
  }

  function createTournament(item, selectedWeapon) {
    const article = document.createElement("article");
    article.className = "result-tournament";

    const dateBlock = document.createElement("div");
    dateBlock.className = "result-tournament-date";
    const time = document.createElement("time");
    time.dateTime = item.competition_date || "";
    time.textContent = item.date_label || formatFullDate(item.competition_date);
    dateBlock.append(time);

    const main = document.createElement("div");
    main.className = "result-tournament-main";
    const eyebrow = document.createElement("p");
    eyebrow.className = "result-eyebrow";
    eyebrow.textContent = item.category || categoryFromEntries(item.entries) || "Результаты соревнований";
    const title = document.createElement("h3");
    title.textContent = item.title || "Без названия";
    main.append(eyebrow, title);

    const metadata = createMetadata(item);
    if (metadata.childElementCount > 0) {
      main.append(metadata);
    }

    const visibleEntries = selectedWeapon
      ? item.entries.filter((entry) => entry.weapon === selectedWeapon)
      : item.entries;
    if (visibleEntries.length > 0) {
      main.append(createGroups(visibleEntries));
    } else if (item.result_text) {
      const legacy = document.createElement("p");
      legacy.className = "result-legacy-text";
      legacy.textContent = item.result_text;
      main.append(legacy);
    } else {
      const noPlaces = document.createElement("p");
      noPlaces.className = "result-no-places";
      noPlaces.textContent = "Призовые места не указаны.";
      main.append(noPlaces);
    }

    const actions = createActions(item);
    if (actions.childElementCount > 0) {
      main.append(actions);
    }
    article.append(dateBlock, main);
    return article;
  }

  function createMetadata(item) {
    const metadata = document.createElement("div");
    metadata.className = "result-metadata";
    const city = item.city || (item.event && item.event.location) || "";
    if (city) {
      metadata.append(createMetaItem("Место", city));
    }
    if (item.event && item.event.title) {
      metadata.append(createMetaItem("Календарь", item.event.title));
    }
    return metadata;
  }

  function createMetaItem(label, value) {
    const item = document.createElement("span");
    const labelElement = document.createElement("b");
    labelElement.textContent = `${label}:`;
    item.append(labelElement, document.createTextNode(` ${value}`));
    return item;
  }

  function createGroups(entries) {
    const wrapper = document.createElement("div");
    wrapper.className = "result-groups";
    const groups = new Map();
    entries.forEach((entry) => {
      const key = [entry.weapon, entry.age_category, entry.competition_format].join("\u0000");
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(entry);
    });
    groups.forEach((groupEntries) => wrapper.append(createGroup(groupEntries)));
    return wrapper;
  }

  function createGroup(entries) {
    const section = document.createElement("section");
    section.className = "result-group";
    const heading = document.createElement("h4");
    heading.textContent = groupTitle(entries[0]);
    section.append(heading);

    const podium = entries.filter((entry) => numberValue(entry.place) <= 3);
    const other = entries.filter((entry) => numberValue(entry.place) > 3);
    if (podium.length > 0) {
      section.append(createPlaces(podium));
    }
    if (other.length > 0) {
      const details = document.createElement("details");
      details.className = "result-more";
      const summary = document.createElement("summary");
      summary.textContent = `Другие результаты (${other.length})`;
      details.append(summary, createPlaces(other));
      section.append(details);
    }
    return section;
  }

  function createPlaces(entries) {
    const list = document.createElement("ol");
    list.className = "result-places";
    entries.forEach((entry) => {
      const item = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = `place-badge place-${Math.min(numberValue(entry.place), 4)}`;
      badge.textContent = String(entry.place);
      const content = document.createElement("div");
      const name = document.createElement("b");
      name.textContent = entry.participant_name || "Участник не указан";
      content.append(name);
      const members = cleanTeamMembers(entry.team_members);
      if (entry.competition_format === "team" && members.length > 0) {
        const details = document.createElement("details");
        details.className = "team-members";
        const summary = document.createElement("summary");
        summary.textContent = "Состав команды";
        const memberList = document.createElement("ul");
        members.forEach((member) => {
          const memberItem = document.createElement("li");
          memberItem.textContent = member;
          memberList.append(memberItem);
        });
        details.append(summary, memberList);
        content.append(details);
      }
      item.append(badge, content);
      list.append(item);
    });
    return list;
  }

  function createActions(item) {
    const actions = document.createElement("div");
    actions.className = "result-actions";
    if (isSafeHttpUrl(item.protocol_url)) {
      actions.append(createLink(item.protocol_url, "Официальный протокол", true));
    }
    if (item.news && item.news.id) {
      actions.append(createLink(`/news/?id=${encodeURIComponent(item.news.id)}`, "Новость о соревновании", false));
    }
    return actions;
  }

  function createLink(href, label, external) {
    const link = document.createElement("a");
    link.className = "result-action";
    link.href = href;
    if (external) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    link.append(document.createTextNode(label));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    link.append(arrow);
    return link;
  }

  function categoryFromEntries(entries) {
    if (!entries.length) {
      return "";
    }
    const parts = [entries[0].age_category, entries[0].weapon, formatLabel(entries[0].competition_format)].filter(Boolean);
    return parts.join(" · ");
  }

  function groupTitle(entry) {
    return [entry.weapon, entry.age_category, formatLabel(entry.competition_format)].filter(Boolean).join(" · ") || "Результат";
  }

  function formatLabel(value) {
    return value === "team" ? "Командные соревнования" : "Личные соревнования";
  }

  function formatFullDate(value) {
    if (!value) {
      return "Дата не указана";
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

  function cleanTeamMembers(value) {
    return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  }

  function isSafeHttpUrl(value) {
    if (!value) {
      return false;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch (error) {
      return false;
    }
  }

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function uniqueSorted(values, descending) {
    return [...new Set(values)].sort((left, right) => (
      descending
        ? String(right).localeCompare(String(left), "ru")
        : String(left).localeCompare(String(right), "ru")
    ));
  }

  function resultCountText(value) {
    const lastTwo = value % 100;
    const last = value % 10;
    let ending = "соревнований";
    if (lastTwo < 11 || lastTwo > 14) {
      if (last === 1) {
        ending = "соревнование";
      } else if (last >= 2 && last <= 4) {
        ending = "соревнования";
      }
    }
    return `Найдено: ${value} ${ending}`;
  }

  function showFallbackNotice() {
    count.textContent = "Показаны сохранённые данные. Обновление из базы временно недоступно.";
  }
})();
