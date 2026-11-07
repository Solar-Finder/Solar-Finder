/**
 * API-Client für das Python-Backend. Vertrag: docs/api/openapi.json
 *
 * Standardmäßig relativ (/api/v1) – Next.js leitet per Rewrite an das Backend
 * weiter (siehe next.config.mjs). Überschreibbar mit NEXT_PUBLIC_API_URL.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

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

async function request(path, { method = "GET", query, body, signal } = {}) {
  const res = await fetch(`${BASE_URL}${path}${toQuery(query)}`, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
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
