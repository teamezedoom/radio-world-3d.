import centroidsJson from '../data/countryCentroids.json'
import type { Located, Station } from '../types'

interface Centroid {
  name: string
  lat: number
  lng: number
  /** Extensión aproximada del país en grados. */
  span: number
}

export const centroids = centroidsJson as Record<string, Centroid>

let displayNames: Intl.DisplayNames | null = null
try {
  displayNames = new Intl.DisplayNames(['es'], { type: 'region' })
} catch {
  displayNames = null
}

/** Nombre del país en español a partir de su código ISO 3166-1. */
export function countryName(code: string, fallback = ''): string {
  if (!code) return fallback || 'Desconocido'
  try {
    const n = displayNames?.of(code)
    if (n && n !== code) return n
  } catch {
    /* código no reconocido */
  }
  return centroids[code]?.name || fallback || code
}

export function flagUrl(code: string, width: 20 | 40 | 80 = 40): string {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`
}

export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/i.test(code)) return '🏳️'
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}

/**
 * Ubicación para mostrar una emisora en el globo.
 * Si la emisora no tiene coordenadas propias se usa el centro del país y se marca como aproximada.
 */
export function stationLocation(s: Station): Located | null {
  if (s.lat !== null && s.lng !== null) return { lat: s.lat, lng: s.lng, approximate: false }
  const c = centroids[s.countryCode]
  return c ? { lat: c.lat, lng: c.lng, approximate: true } : null
}

/** Altitud de cámara (en radios terrestres) adecuada para encuadrar un país. */
export function altitudeForSpan(span: number): number {
  return Math.min(2.4, Math.max(0.25, span / 22))
}

const toRad = (d: number) => (d * Math.PI) / 180

/** Distancia en kilómetros entre dos puntos (fórmula del haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Distancia angular (grados) entre dos puntos de la esfera. */
export function angularDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return (distanceKm(lat1, lng1, lat2, lng2) / 6371) * (180 / Math.PI)
}

export interface Cluster {
  id: string
  lat: number
  lng: number
  stations: Station[]
  /** Suma de popularidad, se usa para ordenar y dar brillo. */
  weight: number
}

/**
 * Agrupa emisoras en celdas de una rejilla geográfica cuyo tamaño depende del zoom.
 * Solo se procesan las emisoras que quedan en el hemisferio visible, lo que mantiene
 * el número de objetos 3D bajo incluso con miles de emisoras cargadas.
 */
export function clusterStations(
  stations: Station[],
  cellDeg: number,
  view: { lat: number; lng: number; radiusDeg: number },
): Cluster[] {
  const cells = new Map<string, Cluster & { sLat: number; sLng: number }>()
  for (const s of stations) {
    if (s.lat === null || s.lng === null) continue
    if (angularDistance(view.lat, view.lng, s.lat, s.lng) > view.radiusDeg) continue
    const row = Math.floor((s.lat + 90) / cellDeg)
    const lngCell = cellDeg / Math.max(0.2, Math.cos(toRad(s.lat)))
    const col = Math.floor((s.lng + 180) / lngCell)
    const key = `${row}:${col}`
    let c = cells.get(key)
    if (!c) {
      c = { id: key, lat: 0, lng: 0, stations: [], weight: 0, sLat: 0, sLng: 0 }
      cells.set(key, c)
    }
    c.stations.push(s)
    c.sLat += s.lat
    c.sLng += s.lng
    c.weight += 1 + Math.log10(1 + s.clickcount)
  }
  const out: Cluster[] = []
  for (const c of cells.values()) {
    c.lat = c.sLat / c.stations.length
    c.lng = c.sLng / c.stations.length
    c.stations.sort((a, b) => b.clickcount - a.clickcount)
    out.push({ id: c.id, lat: c.lat, lng: c.lng, stations: c.stations, weight: c.weight })
  }
  return out
}

/** Normaliza texto para búsquedas sin tildes ni mayúsculas. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
