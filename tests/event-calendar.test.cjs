const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {}, TextEncoder };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/event-calendar.js"), "utf8"), context);
const base = { id: 17, title: "Турнир", date_precision: "exact", start_date: "2028-02-29", updated_at: "2026-11-21T02:00:00Z" };
const build = fields => context.window.EventCalendar.build({ ...base, ...fields });

test("Только подтверждённая дата, последний день включительно", () => {
  for (const date_precision of ["month", "approximate"]) assert.equal(build({ date_precision }), null);
  assert.match(build({}), /DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301/);
  assert.match(build({ end_date: "2028-03-02" }), /DTEND;VALUE=DATE:20280303/);
});

test("Сбор без времени начала и местное время выездного турнира", () => {
  const gathering = build({ meeting_time: "09:15", time_zone: "Asia/Tomsk" });
  assert.match(gathering, /DTSTART;TZID=Asia\/Tomsk:20280229T091500/);
  assert.match(gathering, /BEGIN:VTIMEZONE/);
  assert.match(build({ start_time: "09:15", time_zone: "Europe/Moscow" }), /DTSTART:20280229T061500Z/);
  assert.equal(build({ start_date: "2027-10-31", start_time: "02:30", time_zone: "Europe/Berlin" }), null);
});

test("Кириллица, переносы, экранирование и постоянный идентификатор", () => {
  const title = "Шпага, юниоры; " + "Турнир ".repeat(20) + "\nФинал";
  const raw = build({ title });
  assert.ok(raw.endsWith("END:VCALENDAR\r\n"));
  assert.ok(raw.split("\r\n").every(line => Buffer.byteLength(line) <= 75));
  const unfolded = raw.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("SUMMARY:" + title.replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")));
  assert.ok(unfolded.includes("UID:event-17@fencing-tomsk.ru"));
  assert.ok(unfolded.includes("URL:https://fencing-tomsk.ru/calendar/event/?id=17"));
});
