import { useCallback, useEffect, useState } from 'react'
import { readJSON, writeJSON } from '../lib/storage'
import type { Station } from '../types'

const KEY = 'rw3d:favorites:v1'

export function useFavorites() {
  const [favorites, setFavorites] = useState<Station[]>(() => readJSON<Station[]>(KEY, []))

  useEffect(() => {
    writeJSON(KEY, favorites)
  }, [favorites])

  // Sincroniza entre pestañas abiertas.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setFavorites(readJSON<Station[]>(KEY, []))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isFavorite = useCallback((uuid: string) => favorites.some((f) => f.uuid === uuid), [favorites])

  const toggle = useCallback((s: Station) => {
    setFavorites((prev) => (prev.some((f) => f.uuid === s.uuid) ? prev.filter((f) => f.uuid !== s.uuid) : [s, ...prev]))
  }, [])

  const remove = useCallback((uuid: string) => setFavorites((prev) => prev.filter((f) => f.uuid !== uuid)), [])

  return { favorites, isFavorite, toggle, remove }
}
