// Local Safari preview with two synthetic events and the actual HTTP export handler.
import { createCalendarHandler } from "../../supabase/functions/calendar-event-ics/handler.mjs";

const baseDate = { date_precision: "exact", location: "Томск", published: true };
const events = [
  { ...baseDate, id: 10, title: "[Тест] Чемпионат г. Томска", start_date: "2026-12-06",
    category_label: "Чемпионат", description: "Тестовое событие на один день." },
  { ...baseDate, id: 11, title: "[Тест] Юный мушкетёр", start_date: "2026-12-19", end_date: "2026-12-20",
    category_label: "Турнир", description: "Тестовое событие на два дня." },
];
const jsonEvents = url => {
  const id = url.searchParams.get("id");
  return Response.json(id ? events.filter(event => id === "eq." + event.id) : events);
};
const calendar = createCalendarHandler({
  supabaseUrl: "https://fixture.invalid",
  anonKey: "fixture",
  fetchEvent: url => jsonEvents(url),
});

const repo = new URL("../../", import.meta.url);
const mimeTypes = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  png: "image/png", webp: "image/webp", svg: "image/svg+xml", woff2: "font/woff2",
};

Deno.serve({ hostname: Deno.args[0] || "127.0.0.1", port: 8787 }, async request => {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith("/functions/v1/calendar-event-ics/")) return calendar(request);
  if (request.method !== "GET") return new Response(null, { status: 405 });
  if (path === "/rest/v1/competition_events") return jsonEvents(url);
  if (path === "/js/supabase-config.js") {
    return new Response('window.SUPABASE_CONFIG={url:location.origin,anonKey:"local-calendar-preview-fixture"};', {
      headers: { "Content-Type": mimeTypes.js },
    });
  }
  if (path === "/") return Response.redirect(new URL("/calendar/", url));
  const isCalendarPage = path === "/calendar/" || path === "/calendar/event/";
  if (!isCalendarPage && !/^\/(?:styles\.css|(?:js|images|fonts)\/[\w/.-]+)$/.test(path)) {
    return new Response(null, { status: 404 });
  }
  const file = isCalendarPage ? path + "index.html" : path;
  const type = mimeTypes[file.split(".").at(-1)];
  if (!type) return new Response(null, { status: 404 });
  try {
    const asset = new URL("." + file, repo);
    let body;
    if (path === "/js/site-content.js") {
      // Allow the same-origin HTTP fixture without loosening the production configuration check.
      const source = await Deno.readTextFile(asset);
      const httpsCheck = 'value.url.startsWith("https://")';
      if (!source.includes(httpsCheck)) {
        return new Response("Calendar preview: configuration check changed.", { status: 500 });
      }
      body = source.replace(httpsCheck, 'value.url === location.origin');
    } else {
      body = await Deno.readFile(asset);
    }
    return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    return new Response(null, { status: 404 });
  }
});
