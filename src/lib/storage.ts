/** Acceso seguro a localStorage (puede no existir o fallar en modo privado). */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignorar */
  }
}

/** Caché con caducidad. */
export function readCache<T>(key: string, maxAgeMs: number): T | null {
  const entry = readJSON<{ at: number; data: T } | null>(key, null)
  if (!entry || Date.now() - entry.at > maxAgeMs) return null
  return entry.data
}

export function writeCache(key: string, data: unknown) {
  if (!writeJSON(key, { at: Date.now(), data })) removeKey(key)
}
