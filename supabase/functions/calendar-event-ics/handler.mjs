import { build } from "../../../js/event-calendar.mjs";

const columns = "id,title,start_date,end_date,date_precision,start_time,meeting_time,time_zone,location,description,updated_at,published";

export function createCalendarHandler({ supabaseUrl, anonKey, fetchEvent = fetch }) {
  return async function calendarEvent(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const id = new URL(request.url).pathname.match(/\/calendar-event-ics\/([1-9]\d{0,18})\.ics$/)?.[1];
    if (!id) return new Response(null, { status: 404 });

    try {
      const url = new URL("/rest/v1/competition_events", supabaseUrl);
      url.search = new URLSearchParams({
        select: columns, id: "eq." + id, published: "eq.true", limit: "1"
      });
      const response = await fetchEvent(url, { headers: { apikey: anonKey } });
      if (!response.ok) return new Response(null, { status: 502 });

      const [event] = await response.json();
      const file = event?.published === true && String(event.id) === id ? build(event) : null;
      if (!file) return new Response(null, { status: 404 });
      return new Response(request.method === "HEAD" ? null : file, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Length": String(new TextEncoder().encode(file).byteLength),
          "Content-Disposition": `inline; filename="ffto-event-${id}.ics"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  };
}
