import { AlertTriangle, ArrowLeft, ChevronDown, Globe2, Heart, Loader2, MapPin, RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStationQuery, SORT_OPTIONS, type SortKey } from '../hooks/useStationQuery'
import type { PlayerStatus } from '../hooks/useAudioPlayer'
import { countryName, distanceKm, norm } from '../lib/geo'
import { searchStations } from '../lib/radioBrowser'
import type { Country, PanelView, Station } from '../types'
import Flag from './Flag'
import StationList from './StationList'
import StationDetail from './StationDetail'

export interface ListActions {
  currentId: string | null
  status: PlayerStatus
  onPlay: (s: Station) => void
  onLocate: (s: Station) => void
  isFavorite: (id: string) => boolean
  onToggleFavorite: (s: Station) => void
}

interface Props {
  view: PanelView
  canGoBack: boolean
  onBack: () => void
  onClose?: () => void
  countries: Country[]
  countriesLoading: boolean
  countriesError: string | null
  onRetryCountries: () => void
  onSelectCountry: (code: string) => void
  favorites: Station[]
  geoStations: Station[]
  actions: ListActions
}

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function Header(props: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; onBack?: () => void; onClose?: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
      {props.onBack && (
        <button
          onClick={props.onBack}
          className="-ml-1 cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Volver"
        >
          <ArrowLeft size={18} />
        </button>
      )}
      {props.icon}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-base font-semibold text-white">{props.title}</h2>
        {props.subtitle && <p className="truncate text-xs text-slate-400">{props.subtitle}</p>}
      </div>
      {props.onClose && (
        <button
          onClick={props.onClose}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Cerrar panel"
        >
          <X size={18} />
        </button>
      )}
    </div>
  )
}

function SearchInput(p: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-signal/50">
      <Search size={15} className="shrink-0 text-slate-400" />
      <input
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        className="w-full min-w-0 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
      />
      {p.value && (
        <button onClick={() => p.onChange('')} className="cursor-pointer text-slate-400 hover:text-white" aria-label="Borrar">
          <X size={14} />
        </button>
      )}
    </label>
  )
}

function Select<T extends string>(p: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="sr-only">{p.label}</span>
      <select
        value={p.value}
        onChange={(e) => p.onChange(e.target.value as T)}
        className="w-full cursor-pointer appearance-none truncate rounded-lg bg-white/5 py-1.5 pr-6 pl-2.5 text-xs text-slate-200 ring-1 ring-white/10 focus:ring-signal/50 focus:outline-none"
      >
        {p.options.map((o) => (
          <option key={o.value} value={o.value} className="bg-space-800">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-slate-400" />
    </label>
  )
}

function Status(p: { loading: boolean; error: string | null; empty: boolean; onRetry?: () => void; emptyText?: string }) {
  if (p.error)
    return (
      <div className="m-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-200 ring-1 ring-rose-400/20">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p>{p.error}</p>
          {p.onRetry && (
            <button onClick={p.onRetry} className="mt-2 inline-flex cursor-pointer items-center gap-1 font-medium text-white hover:underline">
              <RefreshCw size={12} /> Reintentar
            </button>
          )}
        </div>
      </div>
    )
  if (p.loading)
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
        <Loader2 size={16} className="animate-spin text-signal" /> Cargando emisoras…
      </div>
    )
  if (p.empty) return <p className="px-4 py-8 text-center text-sm text-slate-400">{p.emptyText ?? 'No se encontraron emisoras.'}</p>
  return null
}

/* ------------------------------------------------------------------ */

function CountriesView(p: Props) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const nq = norm(q)
    return p.countries
      .map((c) => ({ ...c, label: countryName(c.code, c.name) }))
      .filter((c) => !nq || norm(c.label).includes(nq) || norm(c.name).includes(nq) || c.code.toLowerCase() === nq)
      .sort((a, b) => b.stationcount - a.stationcount)
  }, [p.countries, q])
  const total = p.countries.reduce((n, c) => n + c.stationcount, 0)
  return (
    <>
      <Header
        icon={<Globe2 size={20} className="text-signal" />}
        title="Países"
        subtitle={total ? `${p.countries.length} países · ${total.toLocaleString('es')} emisoras` : 'Explora la radio del mundo'}
        onClose={p.onClose}
      />
      <div className="px-3 pt-3">
        <SearchInput value={q} onChange={setQ} placeholder="Filtrar países…" />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <Status
          loading={p.countriesLoading && !p.countries.length}
          error={p.countriesError}
          empty={!p.countriesLoading && !list.length}
          onRetry={p.onRetryCountries}
          emptyText="Ningún país coincide."
        />
        <ul className="space-y-0.5">
          {list.map((c) => (
            <li key={c.code}>
              <button
                onClick={() => p.onSelectCountry(c.code)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/5"
              >
                <Flag code={c.code} />
                <span className="flex-1 truncate text-sm text-slate-100">{c.label}</span>
                <span className="text-xs text-slate-400 tabular-nums">{c.stationcount.toLocaleString('es')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function topValues(stations: Station[], pick: (s: Station) => string[], n: number): string[] {
  const counts = new Map<string, number>()
  for (const s of stations) for (const v of pick(s)) counts.set(v.toLowerCase(), (counts.get(v.toLowerCase()) ?? 0) + 1)
  return [...counts.entries()]
    .filter(([v]) => v.length > 1 && v.length < 30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => v)
}

function QueryList(p: { params: Record<string, string>; actions: ListActions; filters?: boolean; showCountry?: boolean }) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<SortKey>('clickcount')
  const dName = useDebounced(name)
  const params = useMemo(
    () => ({ ...p.params, ...(dName ? { name: dName } : {}), ...(language ? { language } : {}), ...(tag ? { tag } : {}) }),
    [p.params, dName, language, tag],
  )
  const q = useStationQuery(params, sort)

  // Opciones de filtro calculadas a partir de las emisoras reales del país.
  const [options, setOptions] = useState<{ languages: string[]; tags: string[] }>({ languages: [], tags: [] })
  const optionsKey = JSON.stringify(p.params)
  useEffect(() => {
    let alive = true
    setOptions({ languages: [], tags: [] })
    searchStations({ ...p.params, limit: 300 })
      .then((list) => alive && setOptions({ languages: topValues(list, (s) => s.languages, 15), tags: topValues(list, (s) => s.tags, 25) }))
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey])

  return (
    <>
      {p.filters !== false && (
        <div className="space-y-2 px-3 pt-3">
          <SearchInput value={name} onChange={setName} placeholder="Buscar emisora por nombre…" />
          <div className="flex gap-2">
            <Select
              label="Idioma"
              value={language}
              onChange={setLanguage}
              options={[{ value: '', label: 'Todos los idiomas' }, ...options.languages.map((l) => ({ value: l, label: l }))]}
            />
            <Select
              label="Género"
              value={tag}
              onChange={setTag}
              options={[{ value: '', label: 'Todos los géneros' }, ...options.tags.map((t) => ({ value: t, label: t }))]}
            />
          </div>
          <Select label="Ordenar" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <StationList stations={q.stations} showCountry={p.showCountry} {...p.actions} />
        <Status
          loading={q.loading}
          error={q.error}
          empty={!q.loading && !q.error && !q.stations.length}
          onRetry={q.retry}
        />
        {q.hasMore && !q.loading && !q.error && (
          <button
            onClick={() => void q.loadMore()}
            className="mx-auto my-3 block cursor-pointer rounded-full bg-white/5 px-4 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
          >
            Cargar más emisoras
          </button>
        )}
      </div>
    </>
  )
}

function CityView(p: { name: string; countryCode: string; lat: number; lng: number; geoStations: Station[]; actions: ListActions; header: ReactNode }) {
  const RADIUS = 60
  const [fetched, setFetched] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    searchStations({ countrycode: p.countryCode, has_geo_info: true, limit: 1000 })
      .then((l) => alive && setFetched(l))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [p.countryCode, attempt])
  const stations = useMemo(() => {
    const map = new Map<string, Station>()
    for (const s of [...fetched, ...p.geoStations])
      if (s.lat !== null && s.lng !== null && distanceKm(p.lat, p.lng, s.lat, s.lng) <= RADIUS) map.set(s.uuid, s)
    return [...map.values()].sort((a, b) => b.clickcount - a.clickcount)
  }, [fetched, p.geoStations, p.lat, p.lng])
  return (
    <>
      {p.header}
      <p className="px-4 pt-2 text-[11px] text-slate-500">
        Emisoras con coordenadas registradas a menos de {RADIUS} km de {p.name}.
      </p>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <StationList stations={stations} {...p.actions} />
        <Status
          loading={loading && !stations.length}
          error={error}
          empty={!loading && !stations.length}
          onRetry={() => setAttempt((n) => n + 1)}
          emptyText="No hay emisoras con coordenadas registradas cerca de esta ciudad. Prueba a abrir el país."
        />
      </div>
    </>
  )
}

export default function SidePanel(p: Props) {
  const v = p.view
  const back = p.canGoBack ? p.onBack : undefined
  const a = p.actions

  switch (v.kind) {
    case 'countries':
      return <CountriesView {...p} />
    case 'country': {
      const c = p.countries.find((x) => x.code === v.code)
      return (
        <>
          <Header
            onBack={back}
            onClose={p.onClose}
            icon={<Flag code={v.code} className="h-6 w-9" />}
            title={countryName(v.code, c?.name)}
            subtitle={c ? `${c.stationcount.toLocaleString('es')} emisoras registradas` : 'Emisoras del país'}
          />
          <QueryList key={v.code} params={{ countrycode: v.code }} actions={a} />
        </>
      )
    }
    case 'query':
      return (
        <>
          <Header onBack={back} onClose={p.onClose} icon={<Search size={18} className="text-signal" />} title={v.title} subtitle={v.subtitle} />
          <QueryList key={JSON.stringify(v.params)} params={v.params} actions={a} showCountry />
        </>
      )
    case 'city':
      return (
        <CityView
          key={v.name}
          {...v}
          geoStations={p.geoStations}
          actions={a}
          header={
            <Header
              onBack={back}
              onClose={p.onClose}
              icon={<MapPin size={18} className="text-signal" />}
              title={v.name}
              subtitle={countryName(v.countryCode)}
            />
          }
        />
      )
    case 'area':
      return (
        <>
          <Header onBack={back} onClose={p.onClose} icon={<MapPin size={18} className="text-signal" />} title={v.title} subtitle={v.subtitle} />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <StationList stations={v.stations} showCountry {...a} />
          </div>
        </>
      )
    case 'favorites':
      return (
        <>
          <Header
            onBack={back}
            onClose={p.onClose}
            icon={<Heart size={18} className="text-rose-400" fill="currentColor" />}
            title="Mis emisoras"
            subtitle={`${p.favorites.length} guardada${p.favorites.length === 1 ? '' : 's'} en este dispositivo`}
          />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {p.favorites.length ? (
              <StationList stations={p.favorites} showCountry removable {...a} />
            ) : (
              <div className="px-6 py-10 text-center text-sm text-slate-400">
                <Heart size={28} className="mx-auto mb-3 text-slate-600" />
                Aún no tienes favoritas. Pulsa el corazón de cualquier emisora para guardarla aquí.
              </div>
            )}
          </div>
        </>
      )
    case 'station':
      return (
        <>
          <Header onBack={back} onClose={p.onClose} title="Emisora" subtitle={countryName(v.station.countryCode, v.station.country)} />
          <StationDetail station={v.station} actions={a} onSelectCountry={p.onSelectCountry} />
        </>
      )
  }
}
