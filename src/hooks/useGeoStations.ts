import { useCallback, useEffect, useRef, useState } from 'react'
import { searchStations } from '../lib/radioBrowser'
import { readCache, writeCache } from '../lib/storage'
import type { Station } from '../types'

const PAGE_SIZE = 500
const MAX_STATIONS = 6000
const CACHE_KEY = 'rw3d:geo-stations:v1'
const CACHE_AGE = 12 * 60 * 60_000

/**
 * Carga progresivamente las emisoras con coordenadas reales para dibujarlas en el globo.
 * Se descargan por páginas (las más populares primero) y se guardan en caché local.
 */
export function useGeoStations() {
  const [stations, setStations] = useState<Station[]>(() => readCache<Station[]>(CACHE_KEY, CACHE_AGE) ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(() => stations.length > 0)
  const byId = useRef(new Map(stations.map((s) => [s.uuid, s])))
  const started = useRef(false)

  const merge = useCallback((list: Station[]) => {
    let added = false
    for (const s of list) {
      if (s.lat === null || s.lng === null || byId.current.has(s.uuid)) continue
      byId.current.set(s.uuid, s)
      added = true
    }
    if (added) setStations([...byId.current.values()])
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      for (let offset = 0; offset < MAX_STATIONS; offset += PAGE_SIZE) {
        const page = await searchStations({ has_geo_info: true, limit: PAGE_SIZE, offset })
        merge(page)
        if (page.length < PAGE_SIZE * 0.9) break
        // Pausa entre páginas: no saturar la API ni bloquear la interfaz.
        await new Promise((r) => setTimeout(r, 350))
      }
      setComplete(true)
      writeCache(CACHE_KEY, [...byId.current.values()].slice(0, MAX_STATIONS))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar emisoras')
    } finally {
      setLoading(false)
    }
  }, [merge])

  useEffect(() => {
    if (started.current || complete) return
    started.current = true
    void load()
  }, [complete, load])

  return { stations, loading, error, complete, retry: load, merge }
}
