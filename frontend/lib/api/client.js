/**
 * API-Client für das Python-Backend. Vertrag: docs/api/openapi.json
 *
 * Der Browser spricht das Backend direkt an (CORS ist im Backend freigegeben).
 * Bewusst KEIN Umweg über den Next.js-Rewrite-Proxy: Dieser reicht Anfragen so weiter,
 * dass uvicorn unter Windows die Verbindung nach der Antwort hart schließt – größere
 * Antworten kamen dadurch abgeschnitten an (ECONNRESET → „Kartendaten konnten nicht geladen werden“).
 * Überschreibbar mit NEXT_PUBLIC_API_URL (z. B. für ein Deployment hinter einem Reverse-Proxy).
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8000/api/v1` : "http://localhost:8000/api/v1");

export class ApiError extends Error {
  constructor(status, detail) {
    super(`API-Fehler ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

/** Baut einen Query-String; Arrays werden als wiederholte Parameter gesendet. */
function toQuery(params = {}) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => q.append(key, String(v)));
    else q.append(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const RETRY_DELAY_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Alle Endpunkte sind lesend bzw. reine Berechnungen (auch POST /forecast) und dürfen wiederholt werden.
 * Ein Versuch mehr fängt kurzzeitige Verbindungsabbrüche ab (Netzwerkfehler oder 502/503/504/500 vom Proxy).
 */
async function request(path, { method = "GET", query, body, signal } = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}${toQuery(query)}`, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === "AbortError" || attempt > 0) throw e;
    await sleep(RETRY_DELAY_MS);
    return request(path, { method, query, body, signal }, attempt + 1);
  }
  if (res.status >= 500 && attempt === 0 && !signal?.aborted) {
    await sleep(RETRY_DELAY_MS);
    return request(path, { method, query, body, signal }, attempt + 1);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data);
  return data;
}

/** @returns {Promise<import('./types').Meta>} */
export const getMeta = (opts) => request("/meta", opts);

/** @returns {Promise<import('./types').Status>} */
export const getStatus = (postal_code, opts) => request("/status", { ...opts, query: { postal_code } });

/** @returns {Promise<import('./types').PostalAreaCollection>} */
export const getPostalAreas = (postal_code, opts) =>
  request("/map/postal-areas", { ...opts, query: { postal_code } });

/**
 * @param {import('./types').MapFilters & {only_free_potential?: boolean}} [filters]
 * @returns {Promise<import('./types').BuildingCollection>}
 */
export const getBuildings = (filters, opts) => request("/map/buildings", { ...opts, query: filters });

/**
 * Alle Gebäude als kompakte Punktliste [[lon, lat, status, eignungsklasse, potenzial_kwp], …]
 * (status 1 = Anlage, 2 = Potenzial, 0 = kein nennenswertes Potenzial; Klasse und kWp laut LUBW)
 * @param {{postal_code?: string, category?: string[], solar_status?: string[]}} [filters]
 * @returns {Promise<{status_codes: Record<string, string>, points: [number, number, number, number, number][]}>}
 */
export const getBuildingPoints = (filters, opts) => request("/map/building-points", { ...opts, query: filters });

/**
 * @param {{bbox?: string, postal_code?: string, category?: string[], max_power_kwp?: number}} [filters]
 * @returns {Promise<import('./types').InstallationCollection>}
 */
export const getInstallations = (filters, opts) => request("/map/installations", { ...opts, query: filters });

/**
 * @param {'roof-types'|'building-categories'|'suitability-classes'} kind
 * @param {import('./types').MapFilters} [filters]
 * @returns {Promise<import('./types').Breakdown>}
 */
export const getStats = (kind, filters, opts) => request(`/stats/${kind}`, { ...opts, query: filters });

/**
 * @param {import('./types').ForecastRequest} config
 * @returns {Promise<import('./types').ForecastResponse>}
 */
export const postForecast = (config, opts) => request("/forecast", { ...opts, method: "POST", body: config });
