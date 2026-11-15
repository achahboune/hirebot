// POST|GET /countries : compteurs d'offres par pays pour la region et les mots-cles choisis
import { countryFacets } from "./_lib/filter.js";
import { loadSnapshot, json } from "./_lib/snapshot.js";

async function handle(q, ctx) {
  try {
    const snap = await loadSnapshot(ctx);
    if (!snap.generated_at) return json({ detail: "Job sources unavailable: snapshot not generated yet." }, 502);
    return json(countryFacets(snap.jobs || [], q, snap.country_names || {}));
  } catch (e) {
    return json({ detail: "Job sources unavailable: " + String(e.message || e).slice(0, 180) }, 502);
  }
}

export async function onRequestPost(ctx) {
  let q = {};
  try { q = await ctx.request.json(); } catch (_) {}
  return handle(q || {}, ctx);
}

export async function onRequestGet(ctx) {
  const p = new URL(ctx.request.url).searchParams;
  return handle({ keywords: p.getAll("keywords"), region: p.get("region") || "Worldwide" }, ctx);
}
