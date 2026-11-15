// Filtres Germany / Europe / Worldwide, filtre par pays, facettes + tri (port de filter_jobs de app.py)
const KEYWORD_ALIASES = {
  fullstack: ["fullstack", "full stack", "full-stack"],
  "full stack": ["fullstack", "full stack", "full-stack"],
  frontend: ["frontend", "front-end", "front end"],
  backend: ["backend", "back-end", "back end"],
};

export const OUT_FIELDS = ["id", "title", "company", "location", "posted_date", "apply_url", "source", "flag",
  "country", "country_code", "raw_location", "region_priority", "source_links", "first_seen", "match", "matched"];

const EUROPE_CODES = new Set(["DE", "FR", "GB", "IE", "ES", "PT", "IT", "NL", "BE", "LU", "CH", "AT",
  "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "RS", "BA", "ME", "AL", "MK",
  "EE", "LV", "LT", "FI", "SE", "NO", "DK", "IS", "UA", "CY", "MT", "TR", "EU"]);
const UNKNOWN = "ZZ"; // offre sans pays identifiable (Worldwide / Remote)

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

const codesOf = (j) => (j.countries && j.countries.length ? j.countries : [UNKNOWN]);
const byDate = (a, b) => (a.posted_date < b.posted_date ? 1 : a.posted_date > b.posted_date ? -1 : 0);
const slimOut = (j) => Object.fromEntries(OUT_FIELDS.map((k) => [k, j[k]]));

// region + mots-cles (sans le filtre pays)
export function matching(jobs, q) {
  const region = selectedRegion(q);
  const keys = (Array.isArray(q.keywords) ? q.keywords : []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  const newHours = Number(q.new_hours) || 0, now = Number(q.now) || Date.now();
  return jobs.filter((j) => {
    if (!regionOk(j, region)) return false;
    if (newHours > 0) { const t = Date.parse(j.first_seen); if (!(t && now - t <= newHours * 3600e3)) return false; }
    if (!keys.length) return true;
    return keys.some((k) => (KEYWORD_ALIASES[k] || [k]).some((f) => j.kw.includes(f)));
  });
}

// Score de correspondance profil <-> offre : competences trouvees dans l'offre (le titre compte plus)
const forms = (k) => KEYWORD_ALIASES[k] || [k];
function skillsOf(q) {
  return (Array.isArray(q.skills) ? q.skills : []).map((s) => String(s).toLowerCase().trim()).filter(Boolean).slice(0, 30);
}
function score(j, skills) {
  const title = (j.title || "").toLowerCase(), matched = [];
  let pts = 0;
  for (const s of skills) {
    const f = forms(s), inTitle = f.some((x) => title.includes(x));
    if (inTitle || f.some((x) => j.kw.includes(x))) { matched.push(s); pts += inTitle ? 1.5 : 1; }
  }
  return { match: Math.min(100, Math.round((100 * pts) / (Math.min(skills.length, 4) * 1.25))), matched };
}

export function filterJobs(jobs, q) {
  const region = selectedRegion(q);
  const max = Math.min(100, Math.max(1, parseInt(q.max_results, 10) || 100));
  const wanted = (Array.isArray(q.country_codes) ? q.country_codes : []).map((c) => String(c).toUpperCase()).filter(Boolean);
  const skills = skillsOf(q);
  let found = matching(jobs, q);
  if (skills.length) {
    found = found.map((j) => ({ ...j, ...score(j, skills) })); // copies : on ne modifie pas les donnees d'origine
    found.sort((a, b) => b.match - a.match || byDate(a, b)); // meilleur match d'abord, puis date
  } else found.sort(byDate); // date recente d'abord
  if (wanted.length) {
    found = found.filter((j) => codesOf(j).some((c) => wanted.includes(c)));
    found.sort((a, b) => a.region_priority - b.region_priority); // tri stable : date conservee
    return found.slice(0, max).map(slimOut);
  }
  return mix(found, region, max).map(slimOut);
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

// Compteurs par pays (pour region + mots-cles), tries : Allemagne, Europe, reste du monde, puis par nombre d'offres
export function countryFacets(jobs, q, names = {}) {
  const found = matching(jobs, q);
  const tally = new Map(), seen = {};
  for (const j of found) {
    for (const c of codesOf(j)) {
      tally.set(c, (tally.get(c) || 0) + 1);
      if (!seen[c] && j.country_code === c && j.country) seen[c] = j.country;
    }
  }
  const prio = (c) => (c === "DE" ? 0 : EUROPE_CODES.has(c) ? 1 : 2);
  const list = [...tally].map(([code, count]) => ({
    code, count, priority: prio(code),
    name: code === UNKNOWN ? "Worldwide / Remote" : code === "EU" ? "Europe-wide" : names[code] || seen[code] || code,
  }));
  list.sort((a, b) => a.priority - b.priority || (a.code === UNKNOWN) - (b.code === UNKNOWN) || b.count - a.count);
  return { total: found.length, countries: list };
}
