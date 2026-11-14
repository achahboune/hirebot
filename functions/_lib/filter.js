// Filtres Germany / Europe / Worldwide + tri (port de filter_jobs de app.py)
const KEYWORD_ALIASES = {
  fullstack: ["fullstack", "full stack", "full-stack"],
  "full stack": ["fullstack", "full stack", "full-stack"],
  frontend: ["frontend", "front-end", "front end"],
  backend: ["backend", "back-end", "back end"],
};

export const OUT_FIELDS = ["id", "title", "company", "location", "posted_date", "apply_url", "source", "flag",
  "country", "country_code", "raw_location", "region_priority", "source_links"];

export function selectedRegion(q) {
  const r = String(q.region || "").toLowerCase();
  const legacy = (Array.isArray(q.locations) ? q.locations : []).join(" ").toLowerCase();
  if (r.includes("world") || r.includes("global") || r.includes("international") || legacy.includes("world")) return "worldwide";
  if (r.includes("europe") || r === "eu" || legacy.includes("europe")) return "europe";
  return "germany";
}

function regionOk(j, region) {
  if (region === "worldwide") return true;
  if (region === "germany") return (j.countries || []).includes("DE");
  return j.region_priority <= 1; // europe : Allemagne + autres pays europeens
}

export function filterJobs(jobs, q) {
  const region = selectedRegion(q);
  const keys = (Array.isArray(q.keywords) ? q.keywords : []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  const max = Math.min(100, Math.max(1, parseInt(q.max_results, 10) || 100));
  const found = jobs.filter((j) => {
    if (!regionOk(j, region)) return false;
    if (!keys.length) return true;
    return keys.some((k) => (KEYWORD_ALIASES[k] || [k]).some((f) => j.kw.includes(f)));
  });
  found.sort((a, b) => (a.posted_date < b.posted_date ? 1 : a.posted_date > b.posted_date ? -1 : 0)); // 1) date recente d'abord
  return mix(found, region, max).map((j) => Object.fromEntries(OUT_FIELDS.map((k) => [k, j[k]])));
}

// Priorite geographique : Allemagne -> autres pays europeens -> reste du monde.
// Avec 100 resultats max, l'Allemagne (beaucoup d'offres) ne doit pas tout occuper : chaque groupe a un quota,
// et les places non utilisees sont redistribuees dans l'ordre de priorite.
function mix(found, region, max) {
  const groups = [[], [], []];
  for (const j of found) groups[Math.min(2, Math.max(0, j.region_priority))].push(j);
  if (region === "germany") return groups[0].slice(0, max);
  const quotas = region === "europe"
    ? [Math.ceil(max / 2), Math.floor(max / 2), 0]
    : [Math.round(max * 0.4), Math.round(max * 0.3), max - Math.round(max * 0.4) - Math.round(max * 0.3)];
  const take = quotas.map((q, i) => Math.min(q, groups[i].length));
  let left = max - take.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 3 && left > 0; i++) {
    const add = Math.min(left, groups[i].length - take[i]);
    take[i] += add; left -= add;
  }
  return [0, 1, 2].flatMap((i) => groups[i].slice(0, take[i]));
}
