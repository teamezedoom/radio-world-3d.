import type { Country, Station } from '../types'

/**
 * Cliente de Radio Browser (https://docs.radio-browser.info/).
 *
 * - Descubre los servidores espejo disponibles y rota entre ellos si alguno falla.
 * - Aplica tiempo de espera y un número limitado de reintentos.
 * - Mantiene una caché en memoria (y opcionalmente en localStorage) para no repetir consultas.
 */

const FALLBACK_SERVERS = [
  'de1.api.radio-browser.info',
  'de2.api.radio-browser.info',
  'fi1.api.radio-browser.info',
]
const REQUEST_TIMEOUT = 12_000
const MAX_ATTEMPTS = 3
const MEMORY_TTL = 10 * 60_000

let serversPromise: Promise<string[]> | null = null
let serverIndex = 0

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function fetchWithTimeout(url: string, ms: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), ms)
  const onAbort = () => ctrl.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Obtiene la lista de servidores espejo (recomendado por la documentación oficial). */
function getServers(): Promise<string[]> {
  if (!serversPromise) {
    serversPromise = (async () => {
      try {
        const res = await fetchWithTimeout('https://all.api.radio-browser.info/json/servers', 6000)
        if (!res.ok) throw new Error(String(res.status))
        const list = (await res.json()) as { name: string }[]
        const names = [...new Set(list.map((s) => s.name).filter((n) => /radio-browser\.info$/.test(n)))]
        if (names.length) return shuffle(names)
      } catch {
        /* se usan los servidores conocidos */
      }
      return shuffle(FALLBACK_SERVERS)
    })()
  }
  return serversPromise
}

export class ApiError extends Error {}

const memoryCache = new Map<string, { at: number; data: Promise<unknown> }>()

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** GET a la API con rotación de servidores, timeout, reintentos y caché. */
export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  opts: { signal?: AbortSignal; cache?: boolean } = {},
): Promise<T> {
  const key = path + buildQuery(params)
  const useCache = opts.cache !== false
  const cached = memoryCache.get(key)
  if (useCache && cached && Date.now() - cached.at < MEMORY_TTL) return cached.data as Promise<T>

  const run = async (): Promise<T> => {
    const servers = await getServers()
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const host = servers[(serverIndex + attempt) % servers.length]
      try {
        const res = await fetchWithTimeout(`https://${host}${key}`, REQUEST_TIMEOUT, opts.signal)
        if (!res.ok) throw new ApiError(`HTTP ${res.status}`)
        const data = (await res.json()) as T
        serverIndex = (serverIndex + attempt) % servers.length // recuerda el servidor que funcionó
        return data
      } catch (err) {
        if (opts.signal?.aborted) throw err
        lastError = err
        // Espera breve y progresiva antes de probar otro servidor.
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    serverIndex = (serverIndex + 1) % servers.length
    throw new ApiError(
      'No se pudo conectar con Radio Browser. Comprueba tu conexión a Internet e inténtalo de nuevo.',
      { cause: lastError },
    )
  }

  const promise = run()
  if (useCache) {
    memoryCache.set(key, { at: Date.now(), data: promise })
    promise.catch(() => memoryCache.delete(key))
  }
  return promise
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

interface RawStation {
  stationuuid: string
  name: string
  url: string
  url_resolved: string
  homepage: string
  favicon: string
  tags: string
  country: string
  countrycode: string
  state: string
  language: string
  codec: string
  bitrate: number
  hls: number
  geo_lat: number | null
  geo_long: number | null
  votes: number
  clickcount: number
  lastcheckok: number
}

const splitList = (s: string) =>
  (s || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

function validCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0) // 0,0 suele ser un valor vacío, no una ubicación real
  )
}

export function normalizeStation(r: RawStation): Station {
  const hasGeo = validCoord(r.geo_lat, r.geo_long)
  return {
    uuid: r.stationuuid,
    name: (r.name || '').trim() || 'Emisora sin nombre',
    url: (r.url_resolved || r.url || '').trim(),
    urlOriginal: (r.url || '').trim(),
    homepage: r.homepage || '',
    favicon: r.favicon || '',
    tags: splitList(r.tags).slice(0, 8),
    country: r.country || '',
    countryCode: (r.countrycode || '').toUpperCase(),
    state: (r.state || '').trim(),
    languages: splitList(r.language),
    codec: r.codec || '',
    bitrate: r.bitrate || 0,
    hls: r.hls === 1,
    lat: hasGeo ? r.geo_lat : null,
    lng: hasGeo ? r.geo_long : null,
    votes: r.votes || 0,
    clickcount: r.clickcount || 0,
  }
}

function dedupe(list: Station[]): Station[] {
  const seen = new Set<string>()
  return list.filter((s) => s.url && !seen.has(s.uuid) && (seen.add(s.uuid), true))
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export type SearchParams = Record<string, string | number | boolean | undefined>

export async function searchStations(params: SearchParams, signal?: AbortSignal): Promise<Station[]> {
  const raw = await apiGet<RawStation[]>(
    '/json/stations/search',
    { hidebroken: true, order: 'clickcount', reverse: true, limit: 60, ...params },
    { signal },
  )
  return dedupe(raw.map(normalizeStation))
}

export async function getCountries(): Promise<Country[]> {
  const raw = await apiGet<{ name: string; iso_3166_1: string; stationcount: number }[]>('/json/countries', {
    hidebroken: true,
  })
  const map = new Map<string, Country>()
  for (const c of raw) {
    const code = (c.iso_3166_1 || '').toUpperCase()
    if (!/^[A-Z]{2}$/.test(code) || !c.stationcount) continue
    const prev = map.get(code)
    if (prev) prev.stationcount += c.stationcount
    else map.set(code, { code, name: c.name, stationcount: c.stationcount })
  }
  return [...map.values()]
}

export interface NamedCount {
  name: string
  stationcount: number
}

export function getTags(filter: string, limit = 6, signal?: AbortSignal) {
  return apiGet<NamedCount[]>(
    `/json/tags/${encodeURIComponent(filter)}`,
    { order: 'stationcount', reverse: true, hidebroken: true, limit },
    { signal },
  )
}

export function getLanguages(filter: string, limit = 4, signal?: AbortSignal) {
  return apiGet<NamedCount[]>(
    `/json/languages/${encodeURIComponent(filter)}`,
    { order: 'stationcount', reverse: true, hidebroken: true, limit },
    { signal },
  )
}

export function getStates(filter: string, limit = 4, signal?: AbortSignal) {
  return apiGet<(NamedCount & { country: string })[]>(
    `/json/states/${encodeURIComponent(filter)}`,
    { order: 'stationcount', reverse: true, hidebroken: true, limit },
    { signal },
  )
}

/** Emisora aleatoria real (order=random) entre las que funcionan. */
export async function getRandomStation(): Promise<Station | null> {
  const params: SearchParams = { order: 'random', limit: 10, hidebroken: true, reverse: false }
  // En páginas HTTPS el navegador bloquea audio HTTP: se priorizan emisoras HTTPS.
  if (location.protocol === 'https:') params.is_https = true
  const raw = await apiGet<RawStation[]>('/json/stations/search', params, { cache: false })
  const list = dedupe(raw.map(normalizeStation))
  // Preferimos las que tienen coordenadas reales, si hay alguna.
  return list.find((s) => s.lat !== null) ?? list[0] ?? null
}

/**
 * Registra un "clic" de escucha, tal como pide la documentación de Radio Browser
 * para mantener las estadísticas de popularidad. Se ignoran los errores.
 */
export function reportClick(uuid: string) {
  apiGet(`/json/url/${encodeURIComponent(uuid)}`, {}, { cache: false }).catch(() => {})
}
