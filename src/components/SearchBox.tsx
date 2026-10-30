import { Building2, Languages, Loader2, MapPin, Music2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CITIES, type City } from '../data/cities'
import { countryName, norm } from '../lib/geo'
import { getLanguages, getStates, getTags, searchStations, type NamedCount } from '../lib/radioBrowser'
import type { Country, Station } from '../types'
import Flag from './Flag'
import StationLogo from './StationLogo'

export type Suggestion =
  | { type: 'country'; code: string; name: string; count: number }
  | { type: 'city'; city: City }
  | { type: 'region'; name: string; country: string; count: number }
  | { type: 'station'; station: Station }
  | { type: 'tag'; name: string; count: number }
  | { type: 'language'; name: string; count: number }

const GROUP_LABEL: Record<Suggestion['type'], string> = {
  country: 'Países',
  city: 'Ciudades',
  region: 'Regiones',
  station: 'Emisoras',
  tag: 'Géneros',
  language: 'Idiomas',
}

export default function SearchBox({ countries, onSelect }: { countries: Country[]; onSelect: (s: Suggestion) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Sugerencias locales inmediatas (países y ciudades).
  const local = useMemo<Suggestion[]>(() => {
    const nq = norm(q)
    if (nq.length < 2) return []
    const cs: Suggestion[] = countries
      .map((c) => ({ c, label: countryName(c.code, c.name) }))
      .filter(({ c, label }) => norm(label).includes(nq) || norm(c.name).includes(nq))
      .sort((a, b) => Number(norm(b.label).startsWith(nq)) - Number(norm(a.label).startsWith(nq)) || b.c.stationcount - a.c.stationcount)
      .slice(0, 4)
      .map(({ c, label }) => ({ type: 'country', code: c.code, name: label, count: c.stationcount }))
    const cities: Suggestion[] = CITIES.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => norm(n).includes(nq)))
      .slice(0, 4)
      .map((city) => ({ type: 'city', city }))
    return [...cs, ...cities]
  }, [q, countries])

  // Sugerencias remotas (emisoras, géneros, idiomas, regiones) con espera para no saturar la API.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
      const [stations, tags, langs, states] = await Promise.all([
        safe(searchStations({ name: term, limit: 6 }, ctrl.signal)),
        safe(getTags(term, 4, ctrl.signal)),
        safe(getLanguages(term, 3, ctrl.signal)),
        safe(getStates(term, 3, ctrl.signal)),
      ])
      if (ctrl.signal.aborted) return
      const byCount = (x: NamedCount) => x.stationcount > 0
      setRemote([
        ...states.filter(byCount).map((s): Suggestion => ({ type: 'region', name: s.name, country: s.country, count: s.stationcount })),
        ...stations.map((station): Suggestion => ({ type: 'station', station })),
        ...tags.filter(byCount).map((t): Suggestion => ({ type: 'tag', name: t.name, count: t.stationcount })),
        ...langs.filter(byCount).map((l): Suggestion => ({ type: 'language', name: l.name, count: l.stationcount })),
      ])
      setLoading(false)
    }, 320)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  const items = useMemo(() => {
    const order: Suggestion['type'][] = ['country', 'city', 'region', 'station', 'tag', 'language']
    return [...local, ...remote].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  }, [local, remote])

  useEffect(() => setActive(0), [items.length])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const choose = (s: Suggestion) => {
    onSelect(s)
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      if (items[active]) choose(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showDropdown = open && q.trim().length >= 2

  return (
    <div ref={boxRef} className="relative w-full">
      <label className="glass flex items-center gap-2 rounded-full px-4 py-2 transition focus-within:ring-1 focus-within:ring-signal/50">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Busca países, ciudades, emisoras, géneros o idiomas…"
          className="w-full min-w-0 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          aria-label="Buscar"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          enterKeyHint="search"
        />
        {loading && <Loader2 size={15} className="shrink-0 animate-spin text-signal" />}
        {q && (
          <button onClick={() => setQ('')} className="cursor-pointer text-slate-400 hover:text-white" aria-label="Borrar búsqueda">
            <X size={15} />
          </button>
        )}
      </label>

      {showDropdown && (
        <div className="glass scroll-thin !bg-space-900/95 absolute top-full right-0 left-0 z-40 mt-2 max-h-[min(70vh,480px)] animate-fade-in overflow-y-auto rounded-2xl p-1.5">
          {items.length === 0 && !loading && (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Sin resultados para “{q}”.</p>
          )}
          {items.length === 0 && loading && <p className="px-3 py-4 text-center text-sm text-slate-400">Buscando…</p>}
          {items.map((s, i) => {
            const header = i === 0 || items[i - 1].type !== s.type
            return (
              <div key={`${s.type}-${i}`}>
                {header && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">{GROUP_LABEL[s.type]}</div>
                )}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(s)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${
                    i === active ? 'bg-white/10' : ''
                  }`}
                >
                  <SuggestionRow s={s} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SuggestionRow({ s }: { s: Suggestion }) {
  const meta = (t: string) => <span className="ml-auto shrink-0 text-xs text-slate-500">{t}</span>
  switch (s.type) {
    case 'country':
      return (
        <>
          <Flag code={s.code} />
          <span className="truncate text-white">{s.name}</span>
          {meta(`${s.count.toLocaleString('es')} emisoras`)}
        </>
      )
    case 'city':
      return (
        <>
          <Building2 size={16} className="shrink-0 text-sky-300" />
          <span className="truncate text-white">{s.city.name}</span>
          {meta(countryName(s.city.countryCode))}
        </>
      )
    case 'region':
      return (
        <>
          <MapPin size={16} className="shrink-0 text-sky-300" />
          <span className="truncate text-white">{s.name}</span>
          {meta(`${s.country} · ${s.count}`)}
        </>
      )
    case 'station':
      return (
        <>
          <StationLogo src={s.station.favicon} size={24} />
          <span className="truncate text-white">{s.station.name}</span>
          {meta(countryName(s.station.countryCode, s.station.country))}
        </>
      )
    case 'tag':
      return (
        <>
          <Music2 size={16} className="shrink-0 text-fuchsia-300" />
          <span className="truncate text-white capitalize">{s.name}</span>
          {meta(`${s.count.toLocaleString('es')} emisoras`)}
        </>
      )
    case 'language':
      return (
        <>
          <Languages size={16} className="shrink-0 text-amber-300" />
          <span className="truncate text-white capitalize">{s.name}</span>
          {meta(`${s.count.toLocaleString('es')} emisoras`)}
        </>
      )
  }
}

