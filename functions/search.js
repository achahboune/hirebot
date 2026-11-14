// POST /search  (meme contrat que l'ancien backend FastAPI)  +  GET /search?region=Europe&keywords=python
import { filterJobs } from "./_lib/filter.js";
import { loadSnapshot, json } from "./_lib/snapshot.js";

async function handle(q, ctx) {
  try {
    const snap = await loadSnapshot(ctx);
    if (!snap.generated_at) {
      return json({ detail: "Job sources unavailable: snapshot not generated yet (run the 'Refresh jobs' GitHub Action)." }, 502);
    }
    return json(filterJobs(snap.jobs || [], q));
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
  return handle({ keywords: p.getAll("keywords"), region: p.get("region") || "Germany", max_results: p.get("max_results") }, ctx);
}
