import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const { PGlite } = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
const sql = name => readFile(new URL("../supabase/" + name, import.meta.url), "utf8");
const admin = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

test("RPC: RLS, права, черновик, публикация, изменения и полный откат", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users (id uuid primary key);
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text);
  `);
  for (const file of ["setup.sql","site-admin-extension.sql","results-structured-data.sql","results-other-participants.sql"]) {
    await db.exec(await sql(file));
  }
  await db.exec(`
    insert into auth.users values ('${admin}'), ('${other}');
    insert into public.admin_users(user_id) values ('${admin}');
    insert into public.competition_events(id,title,start_date,published) values (101,'Событие','2026-10-01',true);
    insert into public.competition_results(id,competition_date,title,published) values (101,'2026-10-01','Прежний результат',true);
    insert into public.competition_result_entries(id,competition_result_id,place,participant_name) values (101,101,1,'Прежний участник');
  `);
  const snapshot = () => db.query(`
    select (select jsonb_agg(to_jsonb(r) order by id) from competition_results r) as results,
           (select jsonb_agg(to_jsonb(e) order by id) from competition_result_entries e) as entries
  `).then(x => x.rows[0]);
  const existing = await snapshot();
  await db.exec(await sql("results-atomic-save.sql"));
  assert.deepEqual(await snapshot(), existing);

  async function as(role, user, action) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
    await db.exec("set role " + role);
    try { return await action(); } finally { await db.exec("reset role"); }
  }
  const result = {
    competition_date: "2026-11-28", date_label: "28 ноября", title: "Чемпионат", city: "Томск",
    category: "Юниоры", event_id: 101, news_id: 1, protocol_url: "https://example.org/protocol.pdf",
    result_text: "", other_participants: "Спортсмен из Томска", published: false
  };
  const entry = (name, place, extra = {}) => ({
    participant_name: name, place, weapon: "Шпага", age_category: "Юниоры",
    competition_format: "individual", team_members: [], sort_order: 0, ...extra
  });
  const team = entry("Команда", 3, { competition_format: "team", team_members: ["Первый", "Второй"], sort_order: 1 });
  const samePlace = entry("Второй бронзовый призёр", 3, { sort_order: 2 });
  const save = (id, timestamp, data, entries, removed = []) => db.query(
    "select public.save_competition_result($1,$2,$3,$4,$5::bigint[]) as id",
    [id, timestamp, JSON.stringify(data), JSON.stringify(entries), removed]
  ).then(r => r.rows[0].id);
  const editor = action => as("authenticated", admin, action);
  const publicRows = id => as("anon", null, async () => [
    (await db.query("select * from competition_results where id = $1", [id])).rows,
    (await db.query("select * from competition_result_entries where competition_result_id = $1 order by sort_order", [id])).rows
  ]);
  await assert.rejects(as("anon", null, () => save(null, null, result, [])), { code: "42501" });
  await assert.rejects(as("authenticated", other, () => save(null, null, result, [])), { code: "42501" });
  await assert.rejects(editor(() => save(null, null, { ...result, published: true }, [team, entry("Invalid", 0)])), { code: "23514" });
  assert.deepEqual(await snapshot(), existing);

  const id = await editor(() => save(null, null, result, [entry("Победитель", 1), team, samePlace]));
  assert.deepEqual(await publicRows(id), [[], []]);
  const state = () => db.query(`
    select id, updated_at::text, published, title from competition_results where id=$1
  `, [id]).then(x => x.rows[0]);
  const entries = () => db.query(`
    select id, participant_name, place from competition_result_entries where competition_result_id=$1 order by sort_order
  `, [id]).then(x => x.rows);
  const draft = await state();
  const [first, second] = await entries();
  const beforeFailure = await snapshot();
  const published = { ...result, title: "Правки", published: true };
  const changed = entry("Новый победитель", 1, { id: first.id });
  await assert.rejects(editor(() => save(id, draft.updated_at, { ...published, event_id: 999 }, [changed])), { code: "23503" });
  await assert.rejects(editor(() => save(id, draft.updated_at, published, [changed, entry("Неверное место", 1000)])), { code: "23514" });
  await assert.rejects(editor(() => save(id, draft.updated_at, published, [changed], [second.id, 101])), { code: "PT409" });
  assert.deepEqual(await snapshot(), beforeFailure);

  assert.equal(await editor(() => save(id, draft.updated_at, published, [
    changed, { ...team, id: second.id }, entry("Ещё одна бронза", 3, { sort_order: 3 })
  ], [(beforeFailure.entries.find(e => e.participant_name === samePlace.participant_name)).id])), id);
  const [visible, publicEntries] = await publicRows(id);
  assert.equal(visible[0].other_participants, result.other_participants);
  for (const key of ["event_id", "news_id", "protocol_url"]) assert.equal(visible[0][key], result[key]);
  assert.deepEqual(publicEntries.map(e => e.place), [1, 3, 3]);
  assert.deepEqual(publicEntries[1].team_members, team.team_members);
  assert.equal(publicEntries[0].id, first.id);
  assert.equal(publicEntries[0].participant_name, changed.participant_name);
  const publishedBeforeRetry = await snapshot();
  await assert.rejects(editor(() => save(id, draft.updated_at, result, [])), { code: "PT409" });
  assert.deepEqual(await snapshot(), publishedBeforeRetry);
  const current = await state();
  await editor(() => save(id, current.updated_at, { ...published, published: false }, []));
  assert.deepEqual(await publicRows(id), [[], []]);
  assert.equal((await entries()).length, 3);
  const after = await snapshot();
  assert.deepEqual(after.results.find(r => r.id === 101), existing.results[0]);
  assert.deepEqual(after.entries.find(e => e.id === 101), existing.entries[0]);
});
