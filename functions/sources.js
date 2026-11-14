// GET /sources
import { loadSnapshot, json } from "./_lib/snapshot.js";

export async function onRequestGet(ctx) {
  let snap = { sources: {}, jobs: [], generated_at: null, cache_duration_seconds: 10800 };
  try { snap = await loadSnapshot(ctx); } catch (_) {}
  return json({
    providers: [
      { provider: "Arbeitnow", website: "https://www.arbeitnow.com/", api: "https://www.arbeitnow.com/api/job-board-api", coverage: "Germany" },
      { provider: "Jobicy", website: "https://jobicy.com/", api: "https://jobicy.com/api/jobs", coverage: "Remote jobs; Europe and worldwide" },
      { provider: "Remote OK", website: "https://remoteok.com/", api: "https://remoteok.com/api", coverage: "Worldwide remote jobs" },
    ],
    status: snap.sources,
    sources: snap.sources, // format lu par index.html (ok / count)
    cached_jobs: (snap.jobs || []).length,
    cache_duration_seconds: snap.cache_duration_seconds,
    generated_at: snap.generated_at,
  });
}
