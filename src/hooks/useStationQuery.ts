import { useCallback, useEffect, useRef, useState } from 'react'
import { searchStations, type SearchParams } from '../lib/radioBrowser'
import type { Station } from '../types'

const PAGE = 50

export type SortKey = 'clickcount' | 'votes' | 'clicktrend' | 'name' | 'bitrate'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'clickcount', label: 'Más populares' },
  { value: 'votes', label: 'Más votadas' },
  { value: 'clicktrend', label: 'En tendencia' },
  { value: 'bitrate', label: 'Mejor calidad' },
  { value: 'name', label: 'Nombre (A-Z)' },
]

/** Búsqueda paginada de emisoras en Radio Browser. `params === null` desactiva la consulta. */
export function useStationQuery(params: SearchParams | null, sort: SortKey = 'clickcount') {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const offset = useRef(0)
  const ctrl = useRef<AbortController | null>(null)
  const key = params ? JSON.stringify(params) + sort : ''

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (!params) return
      ctrl.current?.abort()
      const c = new AbortController()
      ctrl.current = c
      if (reset) offset.current = 0
      setLoading(true)
      setError(null)
      try {
        const page = await searchStations(
          { ...params, order: sort, reverse: sort !== 'name', limit: PAGE, offset: offset.current },
          c.signal,
        )
        if (c.signal.aborted) return
        offset.current += PAGE
        setHasMore(page.length >= PAGE * 0.8)
        setStations((prev) => {
          if (reset) return page
          const ids = new Set(prev.map((s) => s.uuid))
          return [...prev, ...page.filter((s) => !ids.has(s.uuid))]
        })
      } catch (e) {
        if (c.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Error de conexión')
      } finally {
        if (!c.signal.aborted) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  useEffect(() => {
    setStations([])
    setHasMore(false)
    void fetchPage(true)
    return () => ctrl.current?.abort()
  }, [fetchPage])

  return {
    stations,
    loading,
    error,
    hasMore,
    loadMore: () => fetchPage(false),
    retry: () => fetchPage(stations.length === 0),
  }
}
