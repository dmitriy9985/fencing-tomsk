import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createCalendarHandler } from "../../supabase/functions/calendar-event-ics/handler.mjs";

const live = process.env.QA_TARGET === "production";
const output = "calendar-browser-artifacts";
await mkdir(output, { recursive: true });

const endpoint = "http://127.0.0.1:54853";
const fixtureProjectHost = "niyxpscxjqundylwzycv.supabase.co";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "fixture@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
function token() {
  const pack = (a) => Buffer.from(JSON.stringify(a)).toString("base64url");
  const jwt =
    pack({ alg: "HS256", typ: "JWT" }) +
    "." +
    pack({
      exp: Math.floor(Date.now() / 1000) + 7200,
      role: "authenticated",
      sub: user.id,
    });
  return (
    jwt +
    "." +
    createHmac("sha256", "local-disposable-test-key-only-for-ffto35-qa")
      .update(jwt)
      .digest("base64url")
  );
}
async function run() {
  const browser = await chromium.launch();
  try {
    const log = [];
    for (const width of [1440, 390, 320]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 840 },
        hasTouch: width < 500,
        isMobile: width < 500,
        reducedMotion: "reduce",
        acceptDownloads: true,
      });
      if (!live) {
        await ctx.route("https://calendar.google.com/calendar/render?**", r => r.fulfill({ status: 204 }));
        const appleHandler = createCalendarHandler({ supabaseUrl: endpoint, anonKey: "fixture",
          fetchEvent: (url) => fetch(endpoint + url.pathname.slice(8) + url.search) });
        await ctx.route("**/js/supabase-config.js*", (r) =>
          r.fulfill({
            contentType: "application/javascript",
            body: `window.SUPABASE_CONFIG={url:"https://${fixtureProjectHost}",anonKey:"sb_publishable_fixture_atomic_12345"}`,
          }),
        );
        await ctx.route("https://cdn.jsdelivr.net/**", (r) =>
          r.fulfill({
            path: "node_modules/@supabase/supabase-js/dist/umd/supabase.js",
            contentType: "application/javascript",
            headers: { "access-control-allow-origin": "*" },
          }),
        );
        await ctx.route("https://*.supabase.co/**", async (r) => {
          const request = r.request(),
            url = new URL(request.url());
          assert.equal(url.hostname, fixtureProjectHost);
          if (url.pathname === "/auth/v1/token")
            return r.fulfill({
              json: {
                access_token: token(),
                refresh_token: "disposable",
                expires_in: 7200,
                user,
              },
            });
          if (url.pathname.startsWith("/functions/v1/calendar-event-ics/")) {
            const response = await appleHandler(new Request(url, { method: request.method() }));
            return r.fulfill({ status: response.status, headers: Object.fromEntries(response.headers),
              body: await response.text() });
          }
          assert.match(url.pathname, /^\/rest\/v1\//);
          const headers = { ...request.headers() };
          for (const k of [
            "host",
            "origin",
            "apikey",
            "content-length",
            "accept-encoding",
            "cookie",
          ])
            delete headers[k];
          const response = await ctx.request.fetch(
            endpoint + url.pathname.slice(8) + url.search,
            {
              method: request.method(),
              headers,
              data: request.postDataBuffer() || undefined,
            },
          );
          return r.fulfill({ response });
        });
      }
      const p = await ctx.newPage();
      p.setDefaultTimeout(18000);
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      const origin = live
        ? "https://fencing-tomsk.ru"
        : "http://127.0.0.1:8735";
      const visit = (path) =>
        p.goto(origin + path, { waitUntil: "domcontentloaded" });
      const activate = (loc) => (width < 500 ? loc.tap() : loc.click());
      const assertWidth = async () => {
        const { viewport, content, scroll } = await p.evaluate(() => ({
          viewport: window.innerWidth,
          content: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.equal(viewport, width);
        assert.ok(scroll <= content, "no horizontal overflow");
      };
      await visit("/calendar/");
      const row = (id) =>
        p
          .locator(".event-row")
          .filter({ has: p.locator('a[data-event-id="' + id + '"]') });
      await row(8).waitFor();
      const badges = (id) =>
        row(id).locator(".event-participants li").allTextContents();
      assert.deepEqual(await badges(8), [
        "Юниоры и юниорки · 2007–2013 г.р.",
        "Шпага",
      ]);
      assert.deepEqual(await badges(9), ["Мужчины и женщины", "Шпага"]);
      assert.deepEqual(await badges(10), ["Мужчины и женщины", "Шпага"]);
      assert.deepEqual(await badges(11), ["Дети · 2012–2017 г.р.", "Шпага"]);
      if (!live) {
        assert.equal(await row(12).count(), 0);
        assert.equal(await row(101).locator(".event-participants").count(), 0);
      }
      assert.equal(
        (await row(8).locator(".event-category").textContent()).trim(),
        "Первенство СФО",
      );
      assert.doesNotMatch(
        await row(8).innerText(),
        /Подробное положение|Гаранина/,
      );
      await assertWidth();
      await row(8).screenshot({ path: output + "/calendar-" + width + ".png" });
      const initialHeight = Math.ceil((await row(8).boundingBox()).height);
      const link8 = row(8).locator('a[data-event-id="8"]');
      await activate(link8);
      const dialog = p.locator("#calendar-dialog");
      await dialog
        .getByRole("heading", {
          name: /Первенство Сибирского федерального округа/,
        })
        .waitFor();
      assert.match(await dialog.innerText(), /Гаранина/);
      const checkExport = async (card, id) => {
        await activate(card.locator("summary", { hasText: "Добавить в календарь" }));
        const apple = card.getByRole("link", { name: "Apple Календарь" });
        const appleUrl = await apple.getAttribute("href");
        assert.ok(appleUrl.endsWith("/calendar-event-ics/" + id + ".ics"));
        assert.equal(await apple.getAttribute("download"), null);
        const googleLink = card.getByRole("link", { name: "Google Календарь" });
        const google = new URL(await googleLink.getAttribute("href"));
        assert.equal(google.host, "calendar.google.com");
        assert.equal(google.searchParams.get("action"), "TEMPLATE");
        assert.match(google.searchParams.get("details"), new RegExp("id=" + id + "$"));
        assert.equal(google.searchParams.get("text"), await card.getByRole("heading").first().textContent());
        const location = await card.locator("dt").filter({ hasText: /^Где$/ })
          .evaluate(label => label.nextElementSibling.textContent);
        assert.equal(google.searchParams.get("location"), location);
        if (!live) {
          const [request] = await Promise.all([
            p.waitForRequest(request => request.url() === google.href),
            activate(googleLink),
          ]);
          assert.ok(request.isNavigationRequest());
        }
        if (id === 11) {
          const [start, end] = google.searchParams.get("dates").split("/");
          const parse = date => Date.parse(date.slice(0,4) + "-" + date.slice(4,6) + "-" + date.slice(6) + "T00:00:00Z");
          assert.equal(parse(end) - parse(start), 2 * 86400000);
        }
        const [download] = await Promise.all([
          p.waitForEvent("download"),
          activate(card.getByRole("link", { name: "Скачать .ics" })),
        ]);
        assert.equal(download.suggestedFilename(), "ffto-event-" + id + ".ics");
        const ics = await readFile(await download.path(), "utf8");
        assert.ok(ics.replace(/\r\n /g, "").includes("URL:https://fencing-tomsk.ru/calendar/event/?id=" + id));
        if (!live && id === 8) {
          const [start, end] = google.searchParams.get("dates").split("/");
          assert.equal(google.searchParams.get("ctz"), "Asia/Novosibirsk");
          assert.match(start, /^\d{8}T030000Z$/);
          assert.match(end, /^\d{8}T170000Z$/);
          assert.match(ics, /TZID:Asia\/Novosibirsk\r\nBEGIN:STANDARD/);
          assert.ok(ics.includes("DTSTART;TZID=Asia/Novosibirsk:" + start.slice(0, 8) + "T100000\r\n"));
          assert.match(ics, /DTEND;TZID=Asia\/Novosibirsk:\d{8}T000000/);
          assert.match(ics.replace(/\r\n /g, ""), /DESCRIPTION:Подробное положение\\nПервый старт /);
        }
        if (id === 11) {
          const [start, end] = google.searchParams.get("dates").split("/");
          assert.ok(ics.includes("DTSTART;VALUE=DATE:" + start + "\r\n"));
          assert.ok(ics.includes("DTEND;VALUE=DATE:" + end + "\r\n"));
        }
        await assertWidth();
        const options = card.locator(".event-calendar-options");
        assert.ok(await options.evaluate(panel => panel.scrollWidth <= panel.clientWidth));
        await options.screenshot({ path: output + "/export-" + id + "-" + width + ".png" });
        if (!live) {
          // Validate the actual target navigation and its HTTP response without
          // inferring a native iOS import from Chromium's download behavior.
          const [response] = await Promise.all([
            p.waitForResponse(response => response.url() === appleUrl),
            activate(apple),
          ]);
          assert.ok(response.request().isNavigationRequest());
          assert.equal(response.status(), 200);
          assert.match(response.headers()["content-type"], /^text\/calendar/);
          assert.match(response.headers()["content-disposition"], /^inline/);
        }
      };
      await checkExport(dialog, 8);
      await activate(dialog.getByRole("button", { name: "Закрыть карточку" }));
      await dialog.waitFor({ state: "hidden" });
      assert.ok(await link8.evaluate((a) => a === document.activeElement));
      for (const [id, title] of [
        [8, /Первенство Сибирского федерального округа/],
        [9, /Мастерский/],
        [10, /Чемпионат г. Томска/],
        [11, /Юный мушкетер/],
      ]) {
        await visit("/calendar/event/?id=" + id);
        await p
          .locator("#event-detail")
          .getByRole("heading", { name: title })
          .waitFor();
        await assertWidth();
        if (id === 11) await checkExport(p.locator("#event-detail"), id);
      }
      await visit("/");
      await row(8).waitFor();
      assert.deepEqual(await badges(8), [
        "Юниоры и юниорки · 2007–2013 г.р.",
        "Шпага",
      ]);
      await assertWidth();
      await row(8).screenshot({ path: output + "/home-" + width + ".png" });

      if (live) {
        const calendarScript = p.waitForResponse((response) =>
          response.url().includes("/admin/calendar.js?v=calendar-participants") &&
          response.ok(),
        );
        await visit("/admin/#calendar");
        await calendarScript;
        await p.locator("#login-panel").waitFor({ state: "visible" });
        assert.equal(await p.locator("#calendar-participant-groups").count(), 1);
        assert.equal(await p.locator("#calendar-weapon").count(), 1);
        assert.deepEqual(errors, []);
        log.push({ width, initialHeight, modal: true });
        await ctx.close();
        continue;
      }
      await visit("/admin/#calendar");
      await p.locator("#login-email").fill(user.email);
      await p.locator("#login-password").fill("fixture-only");
      await activate(p.locator("#login-button"));
      const admin8 = p
        .locator("#calendar-list .record-row")
        .filter({ has: p.locator('a[href="/calendar/event/?id=8"]') });
      await admin8.waitFor();
      await activate(
        admin8.getByRole("button", { name: "Изменить", exact: true }),
      );
      const groups = p.locator(".calendar-participant-group");
      const field = (n, i) => groups.nth(n).locator("input").nth(i);
      assert.deepEqual(
        await Promise.all([
          field(0, 0).inputValue(),
          field(0, 1).inputValue(),
          p.locator("#calendar-weapon").inputValue(),
        ]),
        ["Юниоры и юниорки", "2007–2013", "Шпага"],
      );
      await activate(p.locator("#calendar-add-participant-group"));
      await field(1, 0).fill("Кадеты");
      await field(1, 1).fill("2011 - 2009");
      await activate(p.locator("#calendar-save-button"));
      assert.equal(await p.locator("#calendar-editor").isVisible(), true);
      await field(1, 1).fill("2009 - 2011");
      await assertWidth();
      const [updated] = await Promise.all([
        p.waitForResponse(
          (r) =>
            r.request().method() === "PATCH" && r.url().includes("id=eq.8"),
        ),
        activate(p.locator("#calendar-save-button")),
      ]);
      assert.equal(updated.status(), 200, await updated.text());
      await p.locator("#calendar-editor").waitFor({ state: "hidden" });
      await p.getByText("Событие сохранено.", { exact: true }).waitFor();
      await visit("/calendar/");
      await row(8).waitFor();
      assert.deepEqual(await badges(8), [
        "Юниоры и юниорки · 2007–2013 г.р.",
        "Кадеты · 2009–2011 г.р.",
        "Шпага",
      ]);
      const orderedBadges = row(8).locator(".event-participants li");
      const positions = await Promise.all(
        [0, 1, 2].map((index) => orderedBadges.nth(index).boundingBox()),
      );
      if (width === 320)
        assert.ok(
          positions.some(({ y }) => y !== positions[0].y),
          "badges wrap at 320 px",
        );
      await row(8).screenshot({
        path: output + "/multiple-groups-" + width + ".png",
      });
      const multiHeight = Math.ceil((await row(8).boundingBox()).height);
      await assertWidth();
      await visit("/admin/#calendar");
      await activate(
        admin8.getByRole("button", { name: "Изменить", exact: true }),
      );
      assert.equal(await field(1, 1).inputValue(), "2009–2011");
      await activate(
        groups.nth(1).getByRole("button", { name: "Убрать группу" }),
      );
      await activate(p.locator("#calendar-save-button"));
      await p.locator("#calendar-editor").waitFor({ state: "hidden" });
      await p.getByText("Событие сохранено.", { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      log.push({
        width,
        initialHeight,
        multiHeight,
        modal: true,
        adminSave: true,
      });
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
    return log;
  } finally {
    await browser.close();
  }
}

console.log(JSON.stringify(await run(), null, 2));
