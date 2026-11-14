// Lit le snapshot genere par GitHub Actions (public/data/jobs.json)
export async function loadSnapshot({ request, env }) {
  const url = new URL("/data/jobs.json", request.url);
  const res = env && env.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) throw new Error("snapshot HTTP " + res.status);
  return res.json();
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
