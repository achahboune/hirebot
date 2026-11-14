from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional
import asyncio, datetime, time, re, httpx

app = FastAPI(title="HireBot API", version="1.1.0")

ARBEITNOW_API = "https://www.arbeitnow.com/api/job-board-api"
JOBICY_API = "https://jobicy.com/api/jobs"
REMOTEOK_API = "https://remoteok.com/api"
CACHE_DURATION = 3600      # 1 heure (cache normal)
RETRY_DURATION = 300       # 5 min si une source a echoue (pour reessayer vite)
CACHE = {"time": 0, "ttl": CACHE_DURATION, "jobs": [], "sources": {}}
LOCK = asyncio.Lock()

SITES = {"Arbeitnow": "https://www.arbeitnow.com/", "Jobicy": "https://jobicy.com/",
         "Remote OK": "https://remoteok.com/"}

TECH = ["software", "developer", "engineer", "programmer", "devops",
"frontend", "front-end", "backend", "back-end", "full stack", "python",
"java", "javascript", "typescript", "react", "node", "php", "golang",
"rust", "data engineer", "data scientist", "machine learning",
"artificial intelligence", "cloud", "site reliability", "qa engineer",
"test automation", "cybersecurity", "security engineer", "technology",
"technical support", " IT "]

# Le frontend envoie "fullstack", "frontend"... alors que les offres ecrivent "full-stack", "front-end"
KEYWORD_ALIASES = {
    "fullstack": ["fullstack", "full stack", "full-stack"],
    "full stack": ["fullstack", "full stack", "full-stack"],
    "frontend": ["frontend", "front-end", "front end"],
    "backend": ["backend", "back-end", "back end"],
}

# ---------------------------------------------------------------- GEOGRAPHIE
# Format : CODE;Nom affiche;alias pays (separes par des virgules)
COUNTRIES = """
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
"""

# Format : CODE:ville1,ville2 (une ville identifie le pays)
CITIES = """
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
"""

EUROPE_CODES = {"DE", "FR", "GB", "IE", "ES", "PT", "IT", "NL", "BE", "LU", "CH", "AT",
    "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "HR", "SI", "RS", "BA", "ME", "AL", "MK",
    "EE", "LV", "LT", "FI", "SE", "NO", "DK", "IS", "UA", "CY", "MT", "TR", "EU"}

NAMES = {"EU": "Europe"}
ALIAS = {}   # alias -> (code, est_une_ville)
for _line in COUNTRIES.strip().splitlines():
    _code, _name, _aliases = _line.split(";")
    NAMES[_code] = _name
    for _a in _aliases.split(","):
        ALIAS[_a.strip()] = (_code, False)
for _line in CITIES.strip().splitlines():
    _code, _cities = _line.split(":")
    for _c in _cities.split(","):
        ALIAS.setdefault(_c.strip(), (_code, True))

_alts = sorted(ALIAS, key=len, reverse=True)
COUNTRY_RX = re.compile(r"(?<!\w)(" + "|".join(re.escape(a) for a in _alts) + r")(?!\w)", re.I)
EUROPE_RX = re.compile(r"(?<!\w)(europe|european union|eu)(?!\w)", re.I)
GENERIC_RX = re.compile(r"\b(remote|worldwide|anywhere|global|world|international|wide|in|the)\b", re.I)

def flag_of(code):
    if not code: return "\U0001F30D"   # 🌍
    return "".join(chr(0x1F1E6 + ord(c) - 65) for c in code)

def find_countries(text):
    codes, via_city = [], {}
    for m in COUNTRY_RX.finditer(text or ""):
        code, is_city = ALIAS[m.group(1).lower()]
        if code not in codes: codes.append(code)
        via_city[code] = via_city.get(code, True) and is_city
    if not codes and EUROPE_RX.search(text or ""):
        codes = ["EU"]
    return codes, via_city

def geo(source, raw):
    raw = (raw or "").strip()
    codes, via_city = find_countries(raw)
    if not codes and source == "Arbeitnow":      # Arbeitnow = job board allemand
        codes, via_city = ["DE"], {"DE": True}
    code = codes[0] if codes else None
    if code:
        name = NAMES[code]
        if not raw: label = name
        elif len(codes) == 1 and code != "EU" and via_city.get(code): label = raw + ", " + name
        else: label = raw
    else:
        generic = not re.sub(r"[\s,/\-–()]+", "", GENERIC_RX.sub("", raw))
        label = "Worldwide / Remote" if generic else raw
    flag = flag_of(code)
    rank = 0 if "DE" in codes else 1 if any(c in EUROPE_CODES for c in codes) else 2
    return dict(location=flag + " " + label, raw_location=raw, flag=flag, country=NAMES.get(code),
                country_code=code, countries=codes, region_priority=rank)

# ---------------------------------------------------------------- NORMALISATION
def txt(v):
    return " ".join(map(str, v)) if isinstance(v, list) else str(v or "")

def datefmt(v):
    if isinstance(v, (int, float)):
        return datetime.datetime.fromtimestamp(v, datetime.timezone.utc).strftime("%Y-%m-%d")
    return str(v or "")[:10]

def normalize(source, x):
    if source == "Arbeitnow":
        return dict(id=str(x.get("slug") or x.get("url") or ""), title=x.get("title") or "",
        company=x.get("company_name") or "Unknown company", location=x.get("location") or "",
        posted_date=datefmt(x.get("created_at")), apply_url=x.get("url") or "",
        source=source, tags=txt(x.get("tags")), description=txt(x.get("description")))
    if source.startswith("Jobicy"):
        return dict(id=str(x.get("id") or x.get("url") or ""), title=x.get("jobTitle") or "",
        company=x.get("companyName") or "Unknown company", location=txt(x.get("jobGeo")) or "Remote",
        posted_date=datefmt(x.get("pubDate")), apply_url=x.get("url") or "",
        source=source, tags=txt(x.get("jobIndustry"))+" "+txt(x.get("jobType")),
        description=txt(x.get("jobExcerpt"))+" "+txt(x.get("jobDescription")))
    return dict(id=str(x.get("id") or x.get("url") or ""), title=x.get("position") or "",
    company=x.get("company") or "Unknown company", location=x.get("location") or "Remote",
    posted_date=datefmt(x.get("date")), apply_url=x.get("url") or "",
    source=source, tags=txt(x.get("tags")), description=txt(x.get("description")))

def is_tech(j):
    s = " ".join([j["title"], j["tags"], j["description"]]).lower()
    return any(k in s for k in TECH)

# ---------------------------------------------------------------- SOURCES
async def get_arbeitnow(c):
    out = []
    for page in range(1, 6):
        r = await c.get(ARBEITNOW_API, params={"page": page}); r.raise_for_status()
        d = r.json(); batch = d.get("data", [])
        out += [normalize("Arbeitnow", x) for x in batch]
        last = (d.get("meta") or {}).get("last_page") or d.get("last_page")
        if not batch or (last and page >= int(last)): break
    return out

async def get_jobicy(c, geo_name):
    r = await c.get(JOBICY_API, params={"count": 200, "geo": geo_name, "industry": "engineering"})
    r.raise_for_status()
    jobs = r.json().get("jobs", [])
    if not jobs:   # filtre industrie trop strict : on reessaie sans
        r = await c.get(JOBICY_API, params={"count": 200, "geo": geo_name})
        r.raise_for_status()
        jobs = r.json().get("jobs", [])
    return [normalize("Jobicy-"+geo_name.title(), x) for x in jobs]

async def get_remoteok(c):
    r = await c.get(REMOTEOK_API, headers={"User-Agent": "HireBot job aggregator"})
    r.raise_for_status()
    data = r.json()
    return [normalize("Remote OK", x) for x in data if isinstance(x, dict) and x.get("id")] if isinstance(data, list) else []

def base_provider(source):
    return source.split("-")[0]

def norm_url(u):
    return re.sub(r"^https?://(www\.)?", "", u.strip().lower()).split("#")[0].rstrip("/")

def norm_text(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())

def merge_jobs(all_jobs):
    """Enrichit (pays/drapeau) puis supprime les doublons : meme URL, ou meme titre + meme entreprise
    avec un pays compatible. Les liens originaux de chaque fournisseur sont conserves dans source_links."""
    by_url, by_title, unique = {}, {}, []
    for j in all_jobs:
        if not j["apply_url"]: continue
        j.update(geo(j["source"], j["location"]))
        link = {"name": base_provider(j["source"]), "url": j["apply_url"]}
        j["source_links"] = [link]
        key_url = norm_url(j["apply_url"])
        key_title = (norm_text(j["title"]), norm_text(j["company"]))
        dup = by_url.get(key_url)
        if dup is None and key_title[0] and j["company"] != "Unknown company":
            for cand in by_title.get(key_title, []):
                if (not cand["countries"] and not j["countries"]) or set(cand["countries"]) & set(j["countries"]):
                    dup = cand; break
        if dup is not None:
            if link not in dup["source_links"] and link["name"] not in [l["name"] for l in dup["source_links"]]:
                dup["source_links"].append(link)
            if not dup["countries"] and j["countries"]:   # on garde la localisation la plus precise
                for k in ["location", "raw_location", "flag", "country", "country_code", "countries", "region_priority"]:
                    dup[k] = j[k]
            continue
        by_url[key_url] = j
        by_title.setdefault(key_title, []).append(j)
        unique.append(j)
    return unique

async def load_jobs():
    def fresh():
        return CACHE["jobs"] and time.time()-CACHE["time"] < CACHE["ttl"]
    if fresh(): return CACHE["jobs"]
    async with LOCK:
        if fresh(): return CACHE["jobs"]
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
            names = ["Arbeitnow", "Jobicy-Europe", "Jobicy-Anywhere", "Remote OK"]
            tasks = [get_arbeitnow(c), get_jobicy(c, "europe"), get_jobicy(c, "anywhere"), get_remoteok(c)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        all_jobs, status = [], {}
        for name, result in zip(names, results):
            if isinstance(result, BaseException):
                status[name] = {"status": "error", "ok": False, "error": (str(result) or type(result).__name__)[:160], "jobs": 0, "count": 0}
            else:
                status[name] = {"status": "ok", "ok": True, "jobs": len(result), "count": len(result)}
                all_jobs.extend(result)
        failed = [n for n, s in status.items() if not s["ok"]]
        CACHE["sources"] = status
        if len(failed) == len(names):
            CACHE["time"], CACHE["ttl"] = time.time(), RETRY_DURATION
            if CACHE["jobs"]: return CACHE["jobs"]   # toutes les sources KO : on garde l'ancien cache
            raise RuntimeError("; ".join(n + ": " + status[n]["error"] for n in names)[:300])
        CACHE.update(time=time.time(), ttl=RETRY_DURATION if failed else CACHE_DURATION,
                     jobs=merge_jobs(all_jobs))
        return CACHE["jobs"]

# ---------------------------------------------------------------- API
class JobQuery(BaseModel):
    keywords: List[str] = Field(default_factory=list)
    region: Optional[str] = "Germany"
    locations: List[str] = Field(default_factory=list)
    experience_level: str = "any"
    max_results: int = Field(100, ge=1, le=100)

class SourceLink(BaseModel):
    name: str
    url: str

class JobPosting(BaseModel):
    id: str
    title: str
    company: str
    location: str
    posted_date: str
    apply_url: str
    source: Optional[str] = None
    flag: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    raw_location: Optional[str] = None
    region_priority: Optional[int] = None
    source_links: List[SourceLink] = Field(default_factory=list)

def selected_region(q):
    r = (q.region or "").lower()
    legacy = " ".join(q.locations).lower()
    if "world" in r or "global" in r or "international" in r or "world" in legacy: return "worldwide"
    if "europe" in r or r == "eu" or "europe" in legacy: return "europe"
    return "germany"

def region_ok(j, region):
    if region == "worldwide": return True
    if region == "germany": return "DE" in j["countries"]
    return j["region_priority"] <= 1          # europe : Allemagne + autres pays europeens

def keyword_forms(k):
    return KEYWORD_ALIASES.get(k, [k])

OUT_FIELDS = ["id", "title", "company", "location", "posted_date", "apply_url", "source", "flag",
              "country", "country_code", "raw_location", "region_priority", "source_links"]

def filter_jobs(jobs, q):
    region = selected_region(q)
    keys = [x.lower().strip() for x in q.keywords if x.strip()]
    found = []
    for j in jobs:
        if not is_tech(j) or not region_ok(j, region): continue
        haystack = (j["title"]+" "+j["tags"]+" "+j["description"]+" "+j["company"]).lower()
        if keys and not any(f in haystack for k in keys for f in keyword_forms(k)): continue
        found.append(j)
    found.sort(key=lambda x: x["posted_date"], reverse=True)   # 1) date (recent d'abord)
    found.sort(key=lambda x: x["region_priority"])             # 2) priorite geo (tri stable : date conservee)
    return [{k: j[k] for k in OUT_FIELDS} for j in found[:q.max_results]]

@app.get("/")
async def home():
    return FileResponse("index.html")

@app.get("/health")
async def health():
    return {"status":"ok","timestamp":datetime.datetime.now(datetime.timezone.utc).isoformat()}

@app.post("/search", response_model=List[JobPosting])
async def search(q: JobQuery):
    try: return filter_jobs(await load_jobs(), q)
    except Exception as e: raise HTTPException(status_code=502, detail=f"Job sources unavailable: {str(e)[:180]}")

@app.get("/sources")
async def sources():
    try: await load_jobs()
    except Exception: pass
    return {
      "providers":[
        {"provider":"Arbeitnow","website":SITES["Arbeitnow"],"api":ARBEITNOW_API,"coverage":"Germany"},
        {"provider":"Jobicy","website":SITES["Jobicy"],"api":JOBICY_API,"coverage":"Remote jobs; Europe and worldwide"},
        {"provider":"Remote OK","website":SITES["Remote OK"],"api":REMOTEOK_API,"coverage":"Worldwide remote jobs"}
      ],
      "status":CACHE["sources"],
      "sources":CACHE["sources"],   # format lu par index.html (ok / count)
      "cached_jobs":len(CACHE["jobs"]),
      "cache_duration_seconds":CACHE_DURATION
    }
