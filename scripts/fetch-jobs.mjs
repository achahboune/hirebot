// HireBot - generateur du snapshot public/data/jobs.json
// Lance par GitHub Actions (toutes les 3 h). Port JS de la logique de app.py :
// sources en parallele, erreurs isolees, doublons fusionnes, pays + drapeau.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ARBEITNOW_API = "https://www.arbeitnow.com/api/job-board-api";
const JOBICY_API = "https://jobicy.com/api/jobs";
const REMOTEOK_API = "https://remoteok.com/api";
export const CACHE_DURATION = 10800; // 3 h (cadence de rafraichissement)
const OUT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "jobs.json");

// Offre "tech" = le TITRE parle de dev / data / infra / securite (la description seule ne suffit plus :
// elle faisait passer des comptables ou commerciaux de societes tech).
const TECH_RX = new RegExp([
  "software", "developer", "devops", "devsecops", "front-?end", "back-?end", "full[- ]?stack", "python",
  "java(script)?", "typescript", "golang", "kotlin", "php", "react", "node\\.?js", "rust", "ruby", "scala",
  "data (engineer|scientist)", "machine learning", "artificial intelligence", "cybersecurity", "security engineer",
  "site reliability", "test automation", "programmer", "entwickler", "fachinformatiker", "sys-?admin",
  "system administrator", "it support", "technical support", "cloud", "platform engineer", "infrastructure engineer",
  "engineer", "\\b(ai|ml|qa|sre|ios|android)\\b",
].join("|"), "i");
const NOT_TECH_RX = /(mechanical|civil|electrical|structural|chemical|manufacturing|industrial|process|sales|account|recruit|talent|marketing|finance|legal|hr)\s+(\w+\s+)?(engineer|executive|manager)|account executive|vertriebs/i;


// ------------------------------------------------------------ GEOGRAPHIE
// CODE;Nom affiche;alias pays
const COUNTRIES = `
DE;Germany;germany,deutschland
FR;France;france
GB;United Kingdom;united kingdom,uk,u.k.,england,scotland,wales,northern ireland,great britain,britain
IE;Ireland;ireland
ES;Spain;spain,espana,españa
PT;Portugal;portugal
IT;Italy;italy,italia
NL;Netherlands;netherlands,holland,the netherlands
BE;Belgium;belgium
LU;Luxembourg;luxembourg
CH;Switzerland;switzerland,schweiz,suisse
AT;Austria;austria,österreich,osterreich
PL;Poland;poland,polska
CZ;Czech Republic;czech republic,czechia,czech
SK;Slovakia;slovakia
HU;Hungary;hungary
RO;Romania;romania
BG;Bulgaria;bulgaria
GR;Greece;greece
HR;Croatia;croatia
SI;Slovenia;slovenia
RS;Serbia;serbia
BA;Bosnia and Herzegovina;bosnia,bosnia and herzegovina
ME;Montenegro;montenegro
AL;Albania;albania
MK;North Macedonia;north macedonia,macedonia
EE;Estonia;estonia
LV;Latvia;latvia
LT;Lithuania;lithuania
FI;Finland;finland
SE;Sweden;sweden
NO;Norway;norway
DK;Denmark;denmark
IS;Iceland;iceland
UA;Ukraine;ukraine
CY;Cyprus;cyprus
MT;Malta;malta
TR;Turkey;turkey,türkiye,turkiye
US;USA;usa,u.s.a.,u.s.,us,united states,united states of america,america
CA;Canada;canada
MX;Mexico;mexico,méxico
BR;Brazil;brazil,brasil
AR;Argentina;argentina
CO;Colombia;colombia
CL;Chile;chile
AU;Australia;australia
NZ;New Zealand;new zealand
IN;India;india
PK;Pakistan;pakistan
PH;Philippines;philippines
ID;Indonesia;indonesia
VN;Vietnam;vietnam
TH;Thailand;thailand
MY;Malaysia;malaysia
SG;Singapore;singapore
JP;Japan;japan
KR;South Korea;south korea,korea
CN;China;china
IL;Israel;israel
AE;United Arab Emirates;united arab emirates,uae
SA;Saudi Arabia;saudi arabia
EG;Egypt;egypt
MA;Morocco;morocco,maroc
NG;Nigeria;nigeria
KE;Kenya;kenya
ZA;South Africa;south africa
`;

// CODE:ville1,ville2 (une ville identifie le pays)
const CITIES = `
DE:berlin,hamburg,munich,münchen,cologne,köln,frankfurt,stuttgart,düsseldorf,dortmund,essen,leipzig,bremen,dresden,hannover,nuremberg,nürnberg,bonn,karlsruhe,mannheim,augsburg,wiesbaden,freiburg,mainz,aachen,kiel,potsdam,magdeburg,saarbrücken,regensburg,ingolstadt,würzburg,ulm,jena,göttingen,oldenburg,darmstadt,bielefeld,bochum,wuppertal,chemnitz
FR:paris,lyon,marseille,toulouse,nice,nantes,bordeaux,lille,strasbourg,montpellier,rennes
GB:london,manchester,birmingham,edinburgh,glasgow,bristol,leeds,cambridge,oxford,liverpool,belfast,cardiff
IE:dublin,cork,galway
ES:madrid,barcelona,valencia,seville,malaga,bilbao
PT:lisbon,lisboa,porto
IT:rome,milan,turin,bologna,florence
NL:amsterdam,rotterdam,the hague,utrecht,eindhoven
BE:brussels,antwerp,ghent
CH:zurich,zürich,geneva,basel,bern,lausanne
AT:vienna,wien,graz,salzburg,linz
PL:warsaw,krakow,kraków,wroclaw,wrocław,gdansk,poznan
CZ:prague,brno
HU:budapest
RO:bucharest,cluj,cluj-napoca
BG:sofia
GR:athens,thessaloniki
SE:stockholm,gothenburg,malmö,malmo
NO:oslo,bergen
DK:copenhagen,aarhus
FI:helsinki,tampere,espoo
EE:tallinn,tartu
LV:riga
LT:vilnius,kaunas
UA:kyiv,kiev,lviv
TR:istanbul,ankara
US:new york,san francisco,seattle,austin,boston,chicago,los angeles,san diego,denver,atlanta,miami,dallas,houston,portland,washington,california,texas,florida,massachusetts,colorado,illinois
CA:toronto,vancouver,montreal,montréal,ottawa,calgary
AU:sydney,melbourne,brisbane,perth
IN:bangalore,bengaluru,mumbai,delhi,hyderabad,pune,chennai
IL:tel aviv
AE:dubai,abu dhabi
BR:são paulo,sao paulo,rio de janeiro
MX:mexico city
AR:buenos aires
JP:tokyo
MA:casablanca,rabat,tangier,tanger,marrakech
`;

const EUROPE_CODES = new Set(["DE", "FR", "GB", "IE", "ES", "PT", "IT", "NL", "BE", "LU", "CH", "AT",
  "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "RS", "BA", "ME", "AL", "MK",
  "EE", "LV", "LT", "FI", "SE", "NO", "DK", "IS", "UA", "CY", "MT", "TR", "EU"]);

const NAMES = { EU: "Europe" };
const ALIAS = new Map(); // alias -> [code, estUneVille]
for (const line of COUNTRIES.trim().split("\n")) {
  const [code, name, aliases] = line.split(";");
  NAMES[code] = name;
  for (const a of aliases.split(",")) ALIAS.set(a.trim(), [code, false]);
}
for (const line of CITIES.trim().split("\n")) {
  const i = line.indexOf(":");
  const code = line.slice(0, i);
  for (const c of line.slice(i + 1).split(",")) { const k = c.trim(); if (!ALIAS.has(k)) ALIAS.set(k, [code, true]); }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const B = "(?<![\\p{L}\\p{N}_])", E = "(?![\\p{L}\\p{N}_])";
const COUNTRY_RX = new RegExp(B + "(" + [...ALIAS.keys()].sort((a, b) => b.length - a.length).map(esc).join("|") + ")" + E, "giu");
const EUROPE_RX = new RegExp(B + "(europe|european union|eu)" + E, "iu");
const GENERIC_RX = /\b(remote|worldwide|anywhere|global|world|international|wide|in|the)\b/gi;

export function flagOf(code) {
  if (!code) return "\u{1F30D}"; // 🌍
  return String.fromCodePoint(...[...code].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
}

export function findCountries(text) {
  const codes = [], viaCity = {};
  for (const m of (text || "").matchAll(COUNTRY_RX)) {
    const [code, isCity] = ALIAS.get(m[1].toLowerCase());
    if (!codes.includes(code)) codes.push(code);
    viaCity[code] = (viaCity[code] ?? true) && isCity;
  }
  if (!codes.length && EUROPE_RX.test(text || "")) codes.push("EU");
  return { codes, viaCity };
}

export function geo(source, rawIn) {
  const raw = (rawIn || "").trim();
  let { codes, viaCity } = findCountries(raw);
  if (!codes.length && source === "Arbeitnow") { codes = ["DE"]; viaCity = { DE: true }; } // job board allemand
  const code = codes[0] ?? null;
  let label;
  if (code) {
    const name = NAMES[code];
    if (!raw) label = name;
    else if (codes.length === 1 && code !== "EU" && viaCity[code]) label = raw + ", " + name;
    else label = raw;
  } else {
    const generic = !raw.replace(GENERIC_RX, "").replace(/[\s,/\-–()]+/g, "");
    label = generic ? "Worldwide / Remote" : raw;
  }
  const flag = flagOf(code);
  const rank = codes.includes("DE") ? 0 : codes.some((c) => EUROPE_CODES.has(c)) ? 1 : 2;
  return { location: flag + " " + label, raw_location: raw, flag, country: code ? NAMES[code] : null,
    country_code: code, countries: codes, region_priority: rank };
}

// ------------------------------------------------------------ NORMALISATION
const txt = (v) => (Array.isArray(v) ? v.map(String).join(" ") : v == null ? "" : String(v));
const stripHtml = (s) => txt(s).replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

export function datefmt(v) {
  if (typeof v === "number") return new Date(v * 1000).toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export function normalize(source, x) {
  if (source === "Arbeitnow") {
    return { id: String(x.slug || x.url || ""), title: x.title || "", company: x.company_name || "Unknown company",
      location: x.location || "", posted_date: datefmt(x.created_at), apply_url: x.url || "", source,
      tags: txt(x.tags), description: stripHtml(x.description) };
  }
  if (source.startsWith("Jobicy")) {
    return { id: String(x.id || x.url || ""), title: x.jobTitle || "", company: x.companyName || "Unknown company",
      location: (Array.isArray(x.jobGeo) ? x.jobGeo.join(", ") : txt(x.jobGeo)) || "Remote", posted_date: datefmt(x.pubDate), apply_url: x.url || "", source,
      tags: txt(x.jobIndustry) + " " + txt(x.jobType), description: stripHtml(txt(x.jobExcerpt) + " " + txt(x.jobDescription)) };
  }
  return { id: String(x.id || x.url || ""), title: x.position || "", company: x.company || "Unknown company",
    location: x.location || "Remote", posted_date: datefmt(x.date), apply_url: x.url || "", source,
    tags: txt(x.tags), description: stripHtml(x.description) };
}

export const isTech = (j) => TECH_RX.test(j.title) && !NOT_TECH_RX.test(j.title);

// on garde un objet leger : le texte de recherche "kw" remplace la description complete
const slim = (j) => ({ id: j.id, title: j.title, company: j.company, location: j.location, posted_date: j.posted_date,
  apply_url: j.apply_url, source: j.source,
  kw: (j.title + " " + j.tags + " " + j.company + " " + j.description.slice(0, 400)).toLowerCase() });

// ------------------------------------------------------------ SOURCES
async function getJson(f, url, params = {}, headers = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await f(u.toString(), { headers, redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.json();
}

async function getArbeitnow(f) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const d = await getJson(f, ARBEITNOW_API, { page });
    const batch = d.data || [];
    out.push(...batch.map((x) => normalize("Arbeitnow", x)));
    const last = (d.meta || {}).last_page || d.last_page;
    if (!batch.length || (last && page >= Number(last))) break;
  }
  return out;
}

async function getJobicy(f, geoName) {
  let d = await getJson(f, JOBICY_API, { count: 200, geo: geoName, industry: "engineering" });
  let jobs = d.jobs || [];
  if (!jobs.length) { d = await getJson(f, JOBICY_API, { count: 200, geo: geoName }); jobs = d.jobs || []; }
  const label = geoName[0].toUpperCase() + geoName.slice(1);
  return jobs.map((x) => normalize("Jobicy-" + label, x));
}

async function getRemoteok(f) {
  const data = await getJson(f, REMOTEOK_API, {}, { "User-Agent": "HireBot job aggregator" });
  return Array.isArray(data) ? data.filter((x) => x && typeof x === "object" && x.id).map((x) => normalize("Remote OK", x)) : [];
}

// ------------------------------------------------------------ FUSION / DOUBLONS
const baseProvider = (s) => s.split("-")[0];
const normUrl = (u) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("#")[0].replace(/\/+$/, "");
const normText = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const GEO_KEYS = ["location", "raw_location", "flag", "country", "country_code", "countries", "region_priority"];

export function mergeJobs(all) {
  const byUrl = new Map(), byTitle = new Map(), unique = [];
  for (const j of all) {
    if (!j.apply_url) continue;
    Object.assign(j, geo(j.source, j.raw_location ?? j.location));
    const link = { name: baseProvider(j.source), url: j.apply_url };
    j.source_links ??= [link];
    const keyUrl = normUrl(j.apply_url);
    const keyTitle = normText(j.title) + "|" + normText(j.company);
    let dup = byUrl.get(keyUrl);
    if (!dup && normText(j.title) && j.company !== "Unknown company") {
      for (const cand of byTitle.get(keyTitle) || []) {
        const common = cand.countries.some((c) => j.countries.includes(c));
        if ((!cand.countries.length && !j.countries.length) || common) { dup = cand; break; }
      }
    }
    if (dup) {
      for (const l of j.source_links) if (!dup.source_links.some((x) => x.name === l.name)) dup.source_links.push(l);
      if (!dup.countries.length && j.countries.length) for (const k of GEO_KEYS) dup[k] = j[k]; // localisation la plus precise
      continue;
    }
    byUrl.set(keyUrl, j);
    if (!byTitle.has(keyTitle)) byTitle.set(keyTitle, []);
    byTitle.get(keyTitle).push(j);
    unique.push(j);
  }
  return unique;
}

export async function buildSnapshot(f = fetch, prev = null) {
  const names = ["Arbeitnow", "Jobicy-Europe", "Jobicy-Anywhere", "Remote OK"];
  const results = await Promise.allSettled([getArbeitnow(f), getJobicy(f, "europe"), getJobicy(f, "anywhere"), getRemoteok(f)]);
  const all = [], status = {};
  results.forEach((r, i) => {
    const name = names[i];
    if (r.status === "fulfilled") {
      const techJobs = r.value.filter(isTech).map(slim);
      status[name] = { status: "ok", ok: true, jobs: r.value.length, count: r.value.length };
      all.push(...techJobs);
    } else {
      const reused = ((prev && prev.jobs) || []).filter((j) => j.source === name); // on garde les anciennes offres de cette source
      status[name] = { status: "error", ok: false, error: String((r.reason && r.reason.message) || r.reason).slice(0, 160), jobs: 0, count: 0, reused: reused.length };
      all.push(...reused);
    }
  });
  if (names.every((n) => !status[n].ok)) {
    throw new Error("Toutes les sources ont echoue: " + names.map((n) => n + " -> " + status[n].error).join(" | "));
  }
  const jobs = mergeJobs(all);
  // first_seen : date a laquelle HireBot a vu l'offre pour la 1re fois (sert au filtre "nouvelles offres")
  const nowIso = new Date().toISOString(), prevJobs = (prev && prev.jobs) || [], seen = new Map();
  for (const j of prevJobs) seen.set(normUrl(j.apply_url), j.first_seen || prev.generated_at || null);
  for (const j of jobs) {
    const k = normUrl(j.apply_url);
    j.first_seen = seen.has(k) ? seen.get(k) : (prevJobs.length ? nowIso : null); // 1er snapshot : inconnu
  }
  const country_names = {};
  for (const j of jobs) for (const c of j.countries) country_names[c] = NAMES[c] || c;
  return { generated_at: new Date().toISOString(), cache_duration_seconds: CACHE_DURATION, sources: status, country_names, jobs };
}

// ------------------------------------------------------------ MAIN
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch (_) {}
  try {
    const snap = await buildSnapshot(fetch, prev);
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(snap));
    console.log("OK:", snap.jobs.length, "offres");
    for (const [n, s] of Object.entries(snap.sources)) console.log(" -", n, s.ok ? "ok (" + s.count + ")" : "ERREUR " + s.error);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1); // le workflow echoue visiblement et ne commit rien
  }
}
