/**
 * Nexus Store public download counter bridge.
 * Keep GITHUB_TOKEN in Cloudflare Worker Secrets only; never ship it in the app.
 * recentEvents is deliberately retained without an expiry so a retry cannot
 * increment an event again after a later download has pushed it out of a window.
 */
const API_VERSION = "2022-11-28";
const EVENT_ID_RE = /^[A-Za-z0-9._-]{12,100}$/;
const APP_ID_RE = /^[A-Za-z0-9._-]{1,100}$/;

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", ...cors },
  });
}
function corsHeaders(origin, env) {
  const allowed = String(env.CORS_ORIGINS || "tauri://localhost,http://tauri.localhost,http://localhost:1420")
    .split(",").map(x => x.trim()).filter(Boolean);
  if (origin && !allowed.includes("*") && !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function apiHeaders(env) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "Nexus-Store-Download-Counter",
    "Cache-Control": "no-cache",
  };
}
function target(env) {
  const owner = String(env.GITHUB_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO || "").trim();
  const branch = String(env.GITHUB_BRANCH || "main").trim();
  const path = String(env.GITHUB_FILE || "downloads.json").trim().replace(/^\/+|\/+$/g, "");
  const segments = path.split("/");
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)
      || !branch || segments.some(s => !s || s === "." || s === "..")) throw new Error("Worker repository settings are invalid.");
  const encodedPath = segments.map(encodeURIComponent).join("/");
  return { branch, url: "https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/contents/" + encodedPath };
}
async function readCounter(env, file) {
  const response = await fetch(file.url + "?ref=" + encodeURIComponent(file.branch), { headers: apiHeaders(env), cache: "no-store" });
  if (response.status === 404) return { sha: null, data: { schemaVersion: 1, updatedAt: null, apps: {}, recentEvents: [] } };
  if (!response.ok) throw new Error("GitHub read failed (" + response.status + ").");
  const record = await response.json();
  const data = JSON.parse(fromBase64(record.content));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("GitHub downloads.json is not a JSON object.");
  if (!data.apps || typeof data.apps !== "object" || Array.isArray(data.apps)) data.apps = {};
  if (!Array.isArray(data.recentEvents)) data.recentEvents = [];
  data.recentEvents = [...new Set(data.recentEvents.filter(value => typeof value === "string" && EVENT_ID_RE.test(value)))];
  return { sha: record.sha, data };
}
async function getCounts(env) {
  const current = await readCounter(env, target(env));
  return {
    schemaVersion: 1,
    updatedAt: current.data.updatedAt || null,
    apps: current.data.apps,
    recentEvents: current.data.recentEvents,
  };
}
async function increment(env, appId, eventId) {
  const file = target(env);
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await readCounter(env, file);
    const data = current.data;
    const rawPrevious = data.apps[appId] ?? 0;
    const previous = Number(rawPrevious);
    if (!Number.isSafeInteger(previous) || previous < 0) throw new Error("The stored count for " + appId + " is not a non-negative safe integer.");
    if (data.recentEvents.includes(eventId)) {
      return { app_id: appId, event_id: eventId, count: previous, duplicate: true };
    }
    data.apps[appId] = previous + 1;
    data.schemaVersion = 1;
    data.updatedAt = new Date().toISOString();
    data.recentEvents.push(eventId);
    const body = {
      message: "chore(store): record download for " + appId,
      content: toBase64(JSON.stringify(data, null, 2) + "\n"),
      branch: file.branch,
      ...(current.sha ? { sha: current.sha } : {}),
    };
    const response = await fetch(file.url, {
      method: "PUT",
      headers: { ...apiHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { app_id: appId, event_id: eventId, count: data.apps[appId], duplicate: false };
    if (![409, 422].includes(response.status)) {
      const detail = await response.text();
      throw new Error("GitHub write failed (" + response.status + "): " + detail.slice(0, 240));
    }
  }
  throw new Error("The GitHub counter file changed repeatedly. Please retry the request.");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (!cors) return json({ error: "Origin is not allowed by this counter service." }, 403, {});
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405, cors);
    if (!env.GITHUB_TOKEN) return json({ error: "The counter service has no GitHub token configured." }, 503, cors);
    if (url.pathname === "/counts" && request.method === "GET") {
      try { return json(await getCounts(env), 200, cors); }
      catch (error) { return json({ error: error && error.message ? error.message : "Counter read failed." }, 502, cors); }
    }
    if (url.pathname !== "/increment" || request.method !== "POST") return json({ error: "Not found." }, 404, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Expected a JSON request body." }, 400, cors); }
    const appId = String(body && body.app_id || "");
    const eventId = String(body && body.event_id || "");
    if (!APP_ID_RE.test(appId)) return json({ error: "Invalid app_id." }, 400, cors);
    if (!EVENT_ID_RE.test(eventId)) return json({ error: "Invalid event_id." }, 400, cors);
    try { return json(await increment(env, appId, eventId), 200, cors); }
    catch (error) { return json({ error: error && error.message ? error.message : "Counter update failed." }, 502, cors); }
  },
};
