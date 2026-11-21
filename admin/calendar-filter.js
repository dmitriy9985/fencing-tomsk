(function () {
  "use strict";

  const tomskDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tomsk", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const lastDate = "9999-12-31";

  function today(now = new Date()) {
    return tomskDate.format(now);
  }

  function select(items, period, publication, date = today()) {
    const scheduled = items.map(item => {
      const month = item.date_precision === "month" && item.date_year && item.date_month
        ? `${item.date_year}-${String(item.date_month).padStart(2, "0")}` : "";
      const end = month
        ? new Date(Date.UTC(item.date_year, item.date_month, 0)).toISOString().slice(0, 10)
        : item.end_date || item.start_date || lastDate;
      return { item, start: month ? month + "-01" : item.start_date || lastDate, end, past: end < date };
    });
    return scheduled.filter(({ item, past }) => {
      const inPeriod = period === "all" || past === (period === "past");
      const inStatus = publication === "all" || Boolean(item.published) === (publication === "published");
      return inPeriod && inStatus;
    }).sort((a, b) => (
      Number(a.past) - Number(b.past)
      || (a.past ? b.end.localeCompare(a.end) : a.start.localeCompare(b.start))
      || String(b.item.created_at || "").localeCompare(String(a.item.created_at || ""))
    )).map(({ item }) => item);
  }

  window.CalendarFilter = { today, select };
}());
