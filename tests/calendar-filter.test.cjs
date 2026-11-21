const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const scope = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../admin/calendar-filter.js"), "utf8"), scope);
const { today, select } = scope.window.CalendarFilter;

test("Томск: смена дня и года в 17:00 UTC", () => {
  assert.equal(today(new Date("2026-12-31T16:59:59Z")), "2026-12-31");
  assert.equal(today(new Date("2026-12-31T17:00:00Z")), "2027-01-01");
});

const rows = [
  { id: 1, start_date: "2026-11-25", published: false },
  { id: 2, start_date: "2026-12-31", end_date: "2027-01-02", published: true },
  { id: 3, start_date: "2026-12-30", date_precision: "approximate", published: true },
  { id: 4, date_precision: "month", date_year: 2026, date_month: 12, published: false },
  { id: 5, date_precision: "month", date_year: 2027, date_month: 1, published: false },
  { id: 6, start_date: "2027-01-03", published: true }
];
const ids = (period, status, date) => Array.from(select(rows, period, status, date), row => row.id);

test("Актуальные: многодневный турнир виден по последний день, черновики видны", () => {
  assert.deepEqual(ids("current", "all", "2026-12-31"), [4, 2, 5, 6]);
  assert.deepEqual(ids("current", "all", "2027-01-02"), [2, 5, 6]);
  assert.deepEqual(ids("current", "all", "2027-01-03"), [5, 6]);
});

test("Прошедшие по дате окончания, фильтры публикации и полный список", () => {
  assert.deepEqual(ids("past", "all", "2027-01-03"), [2, 4, 3, 1]);
  assert.deepEqual(ids("past", "draft", "2027-01-03"), [4, 1]);
  assert.deepEqual(ids("all", "published", "2027-01-03"), [6, 2, 3]);
  assert.equal(ids("all", "all", "2027-01-03").length, rows.length);
});
