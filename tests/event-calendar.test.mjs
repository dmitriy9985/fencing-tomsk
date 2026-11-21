import { test } from "node:test";
import assert from "node:assert/strict";
import { build as buildIcs, googleCalendarUrl } from "../js/event-calendar.mjs";
import { createCalendarHandler } from "../supabase/functions/calendar-event-ics/handler.mjs";

const base = { id: 17, title: "Турнир", date_precision: "exact", start_date: "2028-02-29", updated_at: "2026-11-21T02:00:00Z" };
const build = fields => buildIcs({ ...base, ...fields });

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

test("Google получает название, адрес, описание и исключающую конечную дату", () => {
  const event = { ...base, title: "Турнир «Юный мушкетёр»", end_date: "2028-03-01",
    location: "Томск, ул. Ленина, 1", description: "Личные соревнования по шпаге." };
  const url = new URL(googleCalendarUrl(event));
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), event.title);
  assert.equal(url.searchParams.get("dates"), "20280229/20280302");
  assert.equal(url.searchParams.get("location"), event.location);
  assert.match(url.searchParams.get("details"), /Личные соревнования.*\n\nВремя уточняется\./);
  assert.match(url.searchParams.get("details"), /calendar\/event\/\?id=17$/);
  assert.equal(url.searchParams.has("ctz"), false);
  assert.equal(googleCalendarUrl({ ...event, date_precision: "approximate" }), null);
});

test("Google сохраняет время организатора и последний день многодневного события", () => {
  const event = { ...base, start_time: "10:00", time_zone: "Asia/Novosibirsk" };
  const oneDay = new URL(googleCalendarUrl(event)).searchParams;
  assert.equal(oneDay.get("ctz"), "Asia/Novosibirsk");
  assert.equal(oneDay.get("dates"), "20280229T030000Z/20280229T040000Z");
  assert.match(oneDay.get("details"), /Проверьте длительность/);
  const multiple = new URL(googleCalendarUrl({ ...event, end_date: "2028-03-01" })).searchParams;
  assert.equal(multiple.get("dates"), "20280229T030000Z/20280301T170000Z");
  assert.equal(googleCalendarUrl({ ...event, time_zone: null }), null);
});

test("HTTP-адрес Apple отдаёт .ics inline и запрашивает только опубликованную запись", async () => {
  const handler = createCalendarHandler({
    supabaseUrl: "https://example.supabase.co",
    anonKey: "test-anon-key",
    fetchEvent: (url, options) => {
      assert.equal(url.pathname, "/rest/v1/competition_events");
      assert.equal(url.searchParams.get("published"), "eq.true");
      assert.equal(options.headers.apikey, "test-anon-key");
      assert.equal(options.headers.Authorization, undefined);
      return Response.json(url.searchParams.get("id") === "eq.17" ? [base] : []);
    },
  });
  const request = (name, method = "GET") => new Request(
    "https://example.supabase.co/functions/v1/calendar-event-ics/" + name, { method }
  );
  const result = await handler(request("17.ics"));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.equal(result.headers.get("content-disposition"), 'inline; filename="ffto-event-17.ics"');
  assert.equal(result.headers.get("cache-control"), "no-store");
  const file = await result.text();
  assert.equal(file, buildIcs(base));
  assert.equal(Number(result.headers.get("content-length")), Buffer.byteLength(file));
  const head = await handler(request("17.ics", "HEAD"));
  assert.equal(head.headers.get("content-disposition"), result.headers.get("content-disposition"));
  assert.equal(head.headers.get("content-length"), result.headers.get("content-length"));
  assert.equal(await head.text(), "");
  assert.equal((await handler(request("18.ics"))).status, 404);
  assert.equal((await handler(request("17.ics", "POST"))).status, 405);
  assert.equal((await handler(request("invalid.ics"))).status, 404);
});
