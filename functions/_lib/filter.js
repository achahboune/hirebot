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
  found.sort((a, b) => a.region_priority - b.region_priority); // 2) priorite geo (tri stable : date conservee)
  return found.slice(0, max).map((j) => Object.fromEntries(OUT_FIELDS.map((k) => [k, j[k]])));
}
