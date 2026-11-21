(function () {
  "use strict";

  function escapeText(text) {
    return String(text).replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
      .replace(/;/g, "\\;").replace(/,/g, "\\,");
  }

  // RFC 5545 counts octets, including the space that starts a continuation.
  function fold(line) {
    const encoder = new TextEncoder();
    let result = "";
    let bytes = 0;
    for (const character of line) {
      const size = encoder.encode(character).length;
      if (bytes + size > 75) {
        result += "\r\n ";
        bytes = 1;
      }
      result += character;
      bytes += size;
    }
    return result;
  }

  function stamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function nextDay(date) {
    const day = new Date(date + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
  }

  // Compare civil time on both sides of any DST change. An ambiguous or
  // skipped wall-clock time cannot be exported as a confirmed instant.
  function instant(date, time, zone) {
    const wall = date + "T" + time.slice(0, 5) + ":00";
    const guess = Date.parse(wall + "Z");
    const format = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    const local = ms => format.format(new Date(ms)).replace(" ", "T");
    const candidates = new Set();
    for (const shift of [-86400000, 0, 86400000]) {
      const probe = guess + shift;
      const offset = Date.parse(local(probe) + "Z") - probe;
      if (local(guess - offset) === wall) candidates.add(guess - offset);
    }
    return candidates.size === 1 ? new Date([...candidates][0]) : null;
  }

  function build(event) {
    if (event.date_precision !== "exact" || !event.start_date) return null;
    const url = "https://fencing-tomsk.ru/calendar/event/?id=" + encodeURIComponent(event.id);
    const dates = [];
    const zones = [];
    const notes = [];
    const start = event.start_date;
    const end = event.end_date || start;
    const time = event.start_time || event.meeting_time;
    if (!time) {
      dates.push("DTSTART;VALUE=DATE:" + start.replace(/-/g, ""),
        "DTEND;VALUE=DATE:" + nextDay(end).replace(/-/g, ""));
      notes.push("Время уточняется.");
    } else {
      const zone = event.time_zone;
      if (!zone) return null;
      const begin = instant(start, time, zone);
      const finish = end > start ? instant(nextDay(end), "00:00", zone) : null;
      if (!begin || (end > start && !finish)) return null;
      // The named Tomsk zone has used UTC+07 throughout this interval.
      if (zone === "Asia/Tomsk" && start >= "2017-01-01" &&
          begin.getTime() === Date.parse(start + "T" + time.slice(0, 5) + ":00+07:00") &&
          (!finish || finish.getTime() === Date.parse(nextDay(end) + "T00:00:00+07:00"))) {
        zones.push("BEGIN:VTIMEZONE", "TZID:Asia/Tomsk", "BEGIN:STANDARD",
          "DTSTART:20170101T000000", "TZOFFSETFROM:+0700", "TZOFFSETTO:+0700",
          "END:STANDARD", "END:VTIMEZONE");
        dates.push("DTSTART;TZID=Asia/Tomsk:" + start.replace(/-/g, "") + "T" + time.slice(0, 5).replace(":", "") + "00");
        if (finish) dates.push("DTEND;TZID=Asia/Tomsk:" + nextDay(end).replace(/-/g, "") + "T000000");
      } else {
        dates.push("DTSTART:" + stamp(begin));
        if (finish) dates.push("DTEND:" + stamp(finish));
      }
      if (event.meeting_time) notes.push("Сбор: " + event.meeting_time.slice(0, 5) + " (" + zone + ").");
      if (event.start_time) notes.push("Начало: " + event.start_time.slice(0, 5) + " (" + zone + ").");
      if (finish) notes.push("В календаре включён весь последний день. Время окончания уточняется.");
    }
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FFTO//Competitions//RU",
      "CALSCALE:GREGORIAN", ...zones, "BEGIN:VEVENT", "UID:event-" + event.id + "@fencing-tomsk.ru",
      "DTSTAMP:" + stamp(new Date(event.updated_at || Date.now())), ...dates,
      "SUMMARY:" + escapeText(event.title), "URL:" + url];
    if (event.location) lines.push("LOCATION:" + escapeText(event.location));
    notes.push(url);
    lines.push("DESCRIPTION:" + escapeText(notes.join("\n")), "END:VEVENT", "END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  window.EventCalendar = { build };
}());
