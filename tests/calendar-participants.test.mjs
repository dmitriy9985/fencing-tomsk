import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const { PGlite } = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
const sql = name => readFile(new URL("../supabase/" + name, import.meta.url), "utf8");
const admin = "00000000-0000-0000-0000-000000000001";
const ordinary = "00000000-0000-0000-0000-000000000002";

test("Optional calendar metadata preserves records, legacy clients and RLS", async t => {
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
  for (const file of ["setup.sql", "site-admin-extension.sql", "calendar-flexible-dates.sql", "calendar-event-details.sql"]) {
    await db.exec(await sql(file));
  }
  await db.exec(`
    insert into auth.users values ('${admin}'), ('${ordinary}');
    insert into public.admin_users(user_id) values ('${admin}');
    insert into public.competition_events(id, title, start_date, published, description)
    values (8, 'Первенство Сибирского федерального округа среди юниоров', '2026-11-28', true, 'Сохранённое описание'),
           (9, 'Всероссийские соревнования «Мастерский»', '2026-12-14', true, ''),
           (10, 'Чемпионат г. Томска', '2026-12-06', true, ''),
           (11, 'Турнир «Юный мушкетер»', '2026-12-19', true, ''),
           (12, 'Черновик', '2026-11-29', false, '');
  `);
  const before = (await db.query("select * from competition_events order by id")).rows;
  await db.exec(await sql("calendar-participants.sql"));
  const oldShape = (await db.query(`
    select to_jsonb(e) - 'participant_groups' - 'weapon_label' - 'updated_at' row from competition_events e order by id
  `)).rows.map(item => item.row);
  const backfill = await sql("calendar-participants-2026-11.sql");
  await db.exec(backfill);
  const after = (await db.query("select * from competition_events order by id")).rows;
  assert.deepEqual(after.map(({ participant_groups, weapon_label, ...row }, i) => ({ ...row, updated_at: before[i].updated_at })), before);
  assert.deepEqual(after.map(e => e.participant_groups), [
    [{label: "Юниоры и юниорки", birth_years: "2007–2013"}],
    [{label: "Мужчины и женщины"}],
    [{label: "Взрослые"}],
    [{birth_years: "2012–2017"}],
    []
  ]);
  assert.deepEqual(after.map(e => e.weapon_label), ["Шпага", "Шпага", null, null, null]);
  await db.exec(backfill);
  assert.deepEqual((await db.query("select * from competition_events order by id")).rows, after);
  assert.deepEqual((await db.query(`
    select to_jsonb(e) - 'participant_groups' - 'weapon_label' - 'updated_at' row from competition_events e order by id
  `)).rows.map(item => item.row), oldShape);

  await db.query("update competition_events set participant_groups=$1::jsonb where id=10",
    [JSON.stringify([{label: "Мужчины и женщины"}])]);
  await db.exec(backfill);
  assert.deepEqual((await db.query("select participant_groups from competition_events where id=10")).rows,
    [{participant_groups: [{label: "Мужчины и женщины"}]}]);

  async function as(role, user, fn) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
    await db.exec("set role " + role);
    try { return await fn(); } finally { await db.exec("reset role"); }
  }
  const select = () => db.query("select id, participant_groups, weapon_label from competition_events order by id");
  const update = value => db.query("update competition_events set participant_groups=$1::jsonb where id=8 returning id", [JSON.stringify(value)]);
  assert.equal((await as("anon", null, select)).rows.length, 4);
  await assert.rejects(as("anon", null, () => update([])), {code: "42501"});
  assert.deepEqual((await as("authenticated", ordinary, () => update([]))).rows, []);
  assert.equal((await as("authenticated", admin, select)).rows.length, 5);
  const edit = fn => as("authenticated", admin, fn);
  const groups = [{label: "Кадеты", birth_years: "2009–2011"}, {label: "Дети", birth_years: "2012, 2014–2016"}, {label: "Начинающие", birth_years: "2017 и младше"}];
  assert.equal((await edit(() => update(groups))).rows.length, 1);
  assert.deepEqual((await as("anon", null, select)).rows[0].participant_groups, groups);
  for (const invalid of [{}, [null], [1], [{}], [{label: "  "}], [{birth_years: "приблизительно"}], [{label: null}], [{birth_years: 2012}], [{label: "A".repeat(65)}]]) {
    await assert.rejects(edit(() => update(invalid)), {code: "23514"}, JSON.stringify(invalid));
  }
  const legacy = await edit(() => db.query(`
    insert into competition_events (title,start_date) values ('Без меток','2026-12-31')
    returning participant_groups, weapon_label
  `));
  assert.deepEqual(legacy.rows, [{participant_groups: [], weapon_label: null}]);
  await edit(() => db.exec("update competition_events set short_label='СФО' where id=8"));
  assert.deepEqual((await as("anon", null, select)).rows[0].participant_groups, groups);
});
