// Tests hors-ligne : fausses API -> snapshot -> fonctions Pages (search/sources/health)
import fs from "node:fs";
import assert from "node:assert/strict";
import { buildSnapshot, geo, flagOf } from "./fetch-jobs.mjs";
import * as search from "../functions/search.js";
import * as sources from "../functions/sources.js";
import * as health from "../functions/health.js";
import { filterJobs } from "../functions/_lib/filter.js";

const arb = (i, t, l, ts, co) => ({ slug: "arb-" + i, title: t, company_name: co || "Co" + i, location: l, created_at: ts, url: "https://www.arbeitnow.com/jobs/" + i, tags: ["Software Development"], description: "<p>python</p>" });
const job = (i, t, g, d, co) => ({ id: i, jobTitle: t, companyName: co || "Co" + i, jobGeo: g, pubDate: d + " 10:00:00", url: "https://jobicy.com/jobs/" + i, jobIndustry: ["Engineering"], jobType: ["Full-Time"], jobExcerpt: "software", jobDescription: "" });
const rok = (i, t, l, d, co) => ({ id: i, position: t, company: co || "Co" + i, location: l, date: d + "T10:00:00+00:00", url: "https://remoteok.com/remote-jobs/" + i, tags: ["dev"], description: "developer" });
const resp = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });

let remoteDown = false;
const fakeFetch = async (url) => {
  const u = new URL(url);
  if (u.hostname.includes("arbeitnow")) return resp({ data: [arb(1, "Backend Developer", "Berlin", 1760000000), arb(2, "Frontend Developer", "Hamburg", 1760500000), arb(3, "Python Developer", "Vienna", 1760900000), arb(4, "Software Engineer", "", 1759000000), arb(5, "Software Engineer", "Munich", 1759500000, "SharedCo"), { ...arb(6, "Office Manager", "Berlin", 1760000000), tags: ["Admin"], description: "paperwork" }, { ...arb(7, "Account Executive", "Berlin", 1760000000), description: "software company technology" }], meta: { last_page: 1 } });
  if (u.hostname.includes("jobicy")) {
    const g = u.searchParams.get("geo");
    return resp({ jobs: g === "europe"
      ? [job(10, "Full-Stack Developer", "France", "2025-10-10"), job(11, "Java Developer", "Germany", "2025-10-12"), job(12, "DevOps Engineer", "Europe", "2025-10-11"), job(13, "Cloud Engineer", ["Poland", "Czechia"], "2025-10-09")]
      : [job(20, "Software Engineer", "Anywhere", "2025-10-14"), job(21, "Backend Developer", "USA", "2025-10-15"), job(10, "Full-Stack Developer", "France", "2025-10-10")] });
  }
  if (remoteDown) return resp({}, false, 429);
  return resp([{ legal: "notice" }, rok(30, "Software Engineer", "Worldwide", "2025-10-20"), rok(31, "Backend Developer", "New York, NY", "2025-10-19"), rok(32, "Software Engineer", "Berlin, Germany", "2025-10-13", "SharedCo"), rok(33, "Data Engineer", "Toronto", "2025-10-18"), rok(34, "Machine Learning Engineer", "London, United Kingdom", "2025-10-17"), rok(35, "Python Developer", "", "2025-10-16")]);
};

// ---- snapshot
let snap = await buildSnapshot(fakeFetch);
assert.equal(snap.sources["Remote OK"].ok, true);
assert.ok(!snap.jobs.some((j) => j.title === "Office Manager" || j.title === "Account Executive"), "offres non-tech exclues");
const ctx = (s) => ({ env: { ASSETS: { fetch: async () => new Response(JSON.stringify(s)) } } });
const post = async (s, body) => { const r = await search.onRequestPost({ request: new Request("https://x.test/search", { method: "POST", body: JSON.stringify(body) }), ...ctx(s) }); return { status: r.status, data: await r.json() }; };
const q = (region, keywords = [], extra = {}) => ({ keywords, region, experience_level: "any", max_results: 100, ...extra });

const g = (await post(snap, q("Germany"))).data, e = (await post(snap, q("Europe"))).data, w = (await post(snap, q("Worldwide"))).data;
for (const [t, rows] of [["GERMANY", g], ["EUROPE", e], ["WORLDWIDE", w]]) {
  console.log("\n==", t, rows.length);
  for (const r of rows) console.log(`  P${r.region_priority} ${r.posted_date} ${r.location.padEnd(40)} ${r.title.padEnd(26)} ${r.source_links.map((l) => l.name)}`);
}
assert.ok(g.length && g.every((r) => r.country_code === "DE"), "Germany = Allemagne seule");
assert.equal(e[0].country_code, "DE");
assert.ok(e.some((r) => r.country_code !== "DE"), "Europe contient d'autres pays");
assert.ok(e.every((r) => ["DE", "AT", "GB", "EU", "FR", "PL"].includes(r.country_code)));
const pr = w.map((r) => r.region_priority);
assert.deepEqual(pr, [...pr].sort(), "Worldwide : Allemagne -> Europe -> reste");
assert.deepEqual([...new Set(pr)], [0, 1, 2]);
for (const rows of [g, e, w]) for (const p of [0, 1, 2]) { const d = rows.filter((r) => r.region_priority === p).map((r) => r.posted_date); assert.deepEqual(d, [...d].sort().reverse(), "date desc dans chaque groupe"); }
assert.equal(new Set(w.map((r) => r.apply_url)).size, w.length);
assert.equal(w.filter((r) => r.title === "Full-Stack Developer").length, 1, "doublon URL");
assert.equal(w.filter((r) => r.title === "Software Engineer" && r.source_links.length > 1).length, 1, "doublon inter-fournisseurs");
assert.equal((await post(snap, q("Europe", ["fullstack"]))).data.length, 1, "alias fullstack");
assert.equal((await post(snap, { region: "Worldwide", max_results: 3 })).data.length, 3);
assert.ok(w.find((r) => r.location === "\u{1F30D} Worldwide / Remote"));
assert.ok(w.find((r) => r.location === "\u{1F1E9}\u{1F1EA} Berlin, Germany"));
assert.equal(flagOf("FR"), "\u{1F1EB}\u{1F1F7}");
assert.equal(geo("Remote OK", "Remote - UK").country_code, "GB");
assert.equal(geo("Remote OK", "Ukraine").country_code, "UA");   // pas confondu avec UK
assert.equal(geo("Remote OK", "Remote").country_code, null);

// ---- quotas : l'Allemagne ne doit pas occuper les 100 places
const mk = (n, rank, code, d) => Array.from({ length: n }, (_, i) => ({ id: code + i, title: "Dev " + code + i, company: "C", location: code, posted_date: d, apply_url: "u" + code + i, source: "x", kw: "dev", region_priority: rank, countries: [code], country_code: code, flag: "", country: code, raw_location: code, source_links: [] }));
const big = [...mk(150, 0, "DE", "2025-10-20"), ...mk(30, 1, "FR", "2025-10-10"), ...mk(60, 2, "US", "2025-10-15")];
const cnt = (rows) => [0, 1, 2].map((p) => rows.filter((r) => r.region_priority === p).length);
assert.deepEqual(cnt(filterJobs(big, { region: "Europe", max_results: 100 })), [70, 30, 0]);
assert.deepEqual(cnt(filterJobs(big, { region: "Worldwide", max_results: 100 })), [40, 30, 30]);
assert.deepEqual(cnt(filterJobs(big, { region: "Germany", max_results: 100 })), [100, 0, 0]);
const ww = filterJobs(big, { region: "Worldwide", max_results: 100 }).map((r) => r.region_priority);
assert.deepEqual(ww, [...ww].sort(), "ordre Allemagne -> Europe -> monde conserve");
assert.deepEqual(cnt(filterJobs(big.slice(0, 5).concat(mk(3, 1, "FR", "2025-10-01")), { region: "Europe", max_results: 100 })), [5, 3, 0]);

// ---- GET + sources + health
const rg = await search.onRequestGet({ request: new Request("https://x.test/search?region=Europe&keywords=python&max_results=2"), ...ctx(snap) });
assert.ok((await rg.json()).length <= 2);
const src = await (await sources.onRequestGet({ request: new Request("https://x.test/sources"), ...ctx(snap) })).json();
assert.equal(src.sources["Arbeitnow"].ok, true); assert.equal(src.cached_jobs, snap.jobs.length);
assert.equal((await (await health.onRequestGet()).json()).status, "ok");

// ---- snapshot vide -> 502 clair
const empty = JSON.parse(fs.readFileSync("public/data/jobs.json", "utf8"));
assert.equal((await post(empty, q("Europe"))).status, 502);

// ---- une source en panne : les autres continuent, anciennes offres conservees
remoteDown = true;
const snap2 = await buildSnapshot(fakeFetch, snap);
assert.equal(snap2.sources["Remote OK"].ok, false);
assert.ok(snap2.sources["Remote OK"].reused > 0);
assert.ok(snap2.jobs.length >= snap.jobs.length - 1);
// ---- toutes en panne -> erreur (rien n'est ecrit)
await assert.rejects(buildSnapshot(async () => resp({}, false, 500), snap));
console.log("\nTOUS LES TESTS OK");
