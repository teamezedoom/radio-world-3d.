import { Heart, List, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Flag from './components/Flag'
import type { GlobeApi } from './components/GlobeView'
import PlayerBar from './components/PlayerBar'
import SearchBox, { type Suggestion } from './components/SearchBox'
import SidePanel, { type ListActions } from './components/SidePanel'
import GlobeControls from './components/GlobeControls'
import Toasts, { type Toast } from './components/Toasts'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useFavorites } from './hooks/useFavorites'
import { useGeoStations } from './hooks/useGeoStations'
import { altitudeForSpan, centroids, countryName, stationLocation, type Cluster } from './lib/geo'
import { getCountries, getRandomStation } from './lib/radioBrowser'
import { readCache, writeCache } from './lib/storage'
import type { Country, PanelView, Station } from './types'

const GlobeView = lazy(() => import('./components/GlobeView'))

function useViewport() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [size, setSize] = useState(get)
  useEffect(() => {
    const on = () => setSize(get())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return size
}

const COUNTRIES_KEY = 'rw3d:countries:v1'

export default function App() {
  const { w, h } = useViewport()
  const desktop = w >= 768
  const globeApi = useRef<GlobeApi | null>(null)

  /* ---------------- Datos ---------------- */
  const [countries, setCountries] = useState<Country[]>(() => readCache<Country[]>(COUNTRIES_KEY, 24 * 3600_000) ?? [])
  const [countriesLoading, setCountriesLoading] = useState(false)
  const [countriesError, setCountriesError] = useState<string | null>(null)
  const loadCountries = useCallback(() => {
    setCountriesLoading(true)
    setCountriesError(null)
    getCountries()
      .then((list) => {
        setCountries(list)
        writeCache(COUNTRIES_KEY, list)
      })
      .catch((e: Error) => setCountriesError(e.message))
      .finally(() => setCountriesLoading(false))
  }, [])
  useEffect(() => {
    if (!countries.length) loadCountries()
  }, [countries.length, loadCountries])
  const countryMap = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries])

  const geo = useGeoStations()
  const fav = useFavorites()

  /* ---------------- Avisos ---------------- */
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = useCallback(
    (t: Omit<Toast, 'id'>, ms = 6000) => {
      const id = ++toastId.current
      setToasts((list) => [...list.slice(-2), { ...t, id }])
      window.setTimeout(() => dismiss(id), ms)
    },
    [dismiss],
  )

  /* ---------------- Panel ---------------- */
  const [stack, setStack] = useState<PanelView[]>([{ kind: 'countries' }])
  const view = stack[stack.length - 1]
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 768)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const push = useCallback((v: PanelView) => {
    setStack((s) => {
      const top = s[s.length - 1]
      if (JSON.stringify(top) === JSON.stringify(v)) return s
      // Evita acumular varias fichas de emisora seguidas.
      const base = top.kind === 'station' && v.kind === 'station' ? s.slice(0, -1) : s
      return [...base.slice(-12), v]
    })
    setPanelOpen(true)
  }, [])
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), [])

  useEffect(() => {
    if (view.kind === 'country') setSelectedCountry(view.code)
    else if (view.kind === 'countries' || view.kind === 'favorites') setSelectedCountry(null)
  }, [view])

  /* ---------------- Cámara ---------------- */
  const flyToCountry = useCallback((code: string) => {
    const c = centroids[code]
    if (c) globeApi.current?.flyTo(c.lat, c.lng, altitudeForSpan(c.span))
  }, [])

  const locate = useCallback(
    (s: Station, announce = true) => {
      const loc = stationLocation(s)
      if (!loc) {
        if (announce) notify({ kind: 'info', text: 'Esta emisora no tiene ubicación conocida en Radio Browser.' })
        return
      }
      if (loc.approximate) {
        globeApi.current?.flyTo(loc.lat, loc.lng, altitudeForSpan(centroids[s.countryCode]?.span ?? 10))
        if (announce)
          notify({
            kind: 'info',
            text: `“${s.name}” no tiene coordenadas exactas: se muestra en el centro de ${countryName(s.countryCode, s.country)} (ubicación aproximada).`,
          })
      } else {
        globeApi.current?.flyTo(loc.lat, loc.lng, 0.22)
      }
    },
    [notify],
  )

  /* ---------------- Reproductor ---------------- */
  const exploreRef = useRef<() => void>(() => {})
  const player = useAudioPlayer({ onNext: () => exploreRef.current() })
  const current = useMemo(() => {
    if (!player.station) return null
    const loc = stationLocation(player.station)
    return loc ? { station: player.station, loc } : null
  }, [player.station])

  const playStation = useCallback(
    (s: Station, fly = true) => {
      const active = player.station?.uuid === s.uuid
      if (active && player.status !== 'error' && player.status !== 'idle') {
        player.toggle()
        return
      }
      void player.play(s)
      geo.merge([s])
      if (fly) locate(s, false)
    },
    [geo, locate, player],
  )

  const lastErrorFor = useRef<string | null>(null)
  useEffect(() => {
    if (player.status === 'error' && player.station && lastErrorFor.current !== player.station.uuid) {
      lastErrorFor.current = player.station.uuid
      notify(
        {
          kind: 'error',
          text: `No se pudo escuchar “${player.station.name}”. ${player.error ?? ''} Selecciona otra emisora.`,
          action: { label: 'Probar otra emisora al azar', run: () => exploreRef.current() },
        },
        9000,
      )
    }
    if (player.status === 'playing') lastErrorFor.current = null
  }, [notify, player.error, player.station, player.status])

  /* ---------------- Exploración aleatoria ---------------- */
  const [exploring, setExploring] = useState(false)
  const [hasExplored, setHasExplored] = useState(false)
  const explore = useCallback(async () => {
    if (exploring) return
    setExploring(true)
    try {
      const s = await getRandomStation()
      if (!s) {
        notify({ kind: 'error', text: 'No se encontró ninguna emisora disponible. Inténtalo de nuevo.' })
        return
      }
      setHasExplored(true)
      setSelectedCountry(s.countryCode || null)
      push({ kind: 'station', station: s })
      if (!desktop) setPanelOpen(false)
      void player.play(s)
      geo.merge([s])
      locate(s, false)
    } catch (e) {
      notify({ kind: 'error', text: e instanceof Error ? e.message : 'Error de conexión con Radio Browser.' })
    } finally {
      setExploring(false)
    }
  }, [desktop, exploring, geo, locate, notify, player, push])
  useEffect(() => {
    exploreRef.current = () => void explore()
  }, [explore])

  /* ---------------- Interacción con el globo ---------------- */
  const selectCountry = useCallback(
    (code: string) => {
      setSelectedCountry(code)
      push({ kind: 'country', code })
      flyToCountry(code)
    },
    [flyToCountry, push],
  )

  const onStationClick = useCallback((s: Station) => push({ kind: 'station', station: s }), [push])

  const onClusterList = useCallback(
    (c: Cluster) => {
      const s0 = c.stations[0]
      push({
        kind: 'area',
        title: `${c.stations.length} emisoras en esta zona`,
        subtitle: [s0.state, countryName(s0.countryCode, s0.country)].filter(Boolean).join(', '),
        stations: c.stations,
      })
    },
    [push],
  )

  const onSuggestion = useCallback(
    (s: Suggestion) => {
      switch (s.type) {
        case 'country':
          return selectCountry(s.code)
        case 'city':
          setSelectedCountry(s.city.countryCode)
          push({ kind: 'city', name: s.city.name, countryCode: s.city.countryCode, lat: s.city.lat, lng: s.city.lng })
          return globeApi.current?.flyTo(s.city.lat, s.city.lng, 0.18)
        case 'region': {
          const code = countries.find((c) => c.name === s.country)?.code
          push({ kind: 'query', title: s.name, subtitle: `Región · ${s.country}`, params: { state: s.name, country: s.country, stateExact: 'true' } })
          if (code) {
            setSelectedCountry(code)
            flyToCountry(code)
          }
          return
        }
        case 'station':
          push({ kind: 'station', station: s.station })
          return locate(s.station, false)
        case 'tag':
          return push({ kind: 'query', title: s.name, subtitle: `Género · ${s.count.toLocaleString('es')} emisoras`, params: { tag: s.name, tagExact: 'true' } })
        case 'language':
          return push({ kind: 'query', title: s.name, subtitle: `Idioma · ${s.count.toLocaleString('es')} emisoras`, params: { language: s.name, languageExact: 'true' } })
      }
    },
    [countries, flyToCountry, locate, push, selectCountry],
  )

  const actions: ListActions = {
    currentId: player.station?.uuid ?? null,
    status: player.status,
    onPlay: (s) => playStation(s),
    onLocate: (s) => {
      locate(s)
      if (!desktop) setPanelOpen(false)
    },
    isFavorite: fav.isFavorite,
    onToggleFavorite: (s) => {
      const was = fav.isFavorite(s.uuid)
      fav.toggle(s)
      notify({ kind: 'info', text: was ? `“${s.name}” eliminada de Mis emisoras.` : `“${s.name}” guardada en Mis emisoras.` }, 3000)
    },
  }

  /* ---------------- Layout ---------------- */
  const PANEL_W = 380
  const showPanel = panelOpen
  const globeOffset: [number, number] = desktop ? [showPanel ? (PANEL_W + 12) / 2 : 0, -30] : [0, -40]
  const selected = selectedCountry ? countryMap.get(selectedCountry) : undefined

  return (
    <div className="fixed inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_center,#0b1730_0%,#050a18_45%,#02040b_100%)] select-none">
      {/* Globo */}
      <div className="absolute inset-0">
        <Suspense
          fallback={
            <div className="grid h-full place-items-center text-sm text-slate-400">
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 animate-spin rounded-full border-2 border-signal/20 border-t-signal" />
                Preparando el planeta…
              </div>
            </div>
          }
        >
          <GlobeView
            apiRef={globeApi}
            width={w}
            height={h}
            offset={globeOffset}
            stations={geo.stations}
            countries={countryMap}
            selectedCountry={selectedCountry}
            current={current}
            isPlaying={player.status === 'playing'}
            onCountryClick={selectCountry}
            onStationClick={onStationClick}
            onClusterList={onClusterList}
          />
        </Suspense>
      </div>

      {/* Barra superior */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-4 sm:px-4">
        <button
          onClick={() => {
            setStack([{ kind: 'countries' }])
            globeApi.current?.reset()
          }}
          className="pointer-events-auto flex shrink-0 cursor-pointer items-center gap-2.5"
          aria-label="Radio World 3D, volver a la vista mundial"
        >
          <span className="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-sky-500/40 to-space-900 ring-1 ring-signal/40">
            <span className="h-2 w-2 rounded-full bg-signal shadow-[0_0_10px_#39ff88]" />
            <span className="absolute inset-0 animate-ping rounded-full ring-1 ring-signal/30 [animation-duration:3s]" />
          </span>
          <span className="hidden font-display text-lg leading-none font-bold tracking-[0.18em] text-white lg:block">
            RADIO WORLD <span className="text-signal">3D</span>
          </span>
        </button>
        <div className="pointer-events-auto mx-auto w-full max-w-xl min-w-0">
          <SearchBox countries={countries} onSelect={onSuggestion} />
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => push({ kind: 'favorites' })}
            className="glass flex h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-sm text-slate-200 hover:text-rose-300"
            aria-label="Mis emisoras"
            title="Mis emisoras"
          >
            <Heart size={17} className={fav.favorites.length ? 'text-rose-400' : ''} fill={fav.favorites.length ? 'currentColor' : 'none'} />
            <span className="hidden sm:inline">Mis emisoras</span>
            {fav.favorites.length > 0 && <span className="text-xs text-slate-400 tabular-nums">{fav.favorites.length}</span>}
          </button>
        </div>
      </header>

      {/* País seleccionado */}
      {selectedCountry && (
        <div key={selectedCountry} className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+52px)] z-20 flex justify-center px-3 md:pl-[400px]">
          <div className="glass pointer-events-auto flex animate-slide-up items-center gap-3 rounded-full py-1.5 pr-2 pl-2">
            <Flag code={selectedCountry} className="h-6 w-9 rounded-full" />
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold text-white">{countryName(selectedCountry, selected?.name)}</div>
              <div className="text-[11px] text-slate-400">
                {selected ? `${selected.stationcount.toLocaleString('es')} emisoras` : 'Sin emisoras registradas'}
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedCountry(null)
                setStack([{ kind: 'countries' }])
              }}
              className="ml-1 cursor-pointer rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar país"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Panel lateral (escritorio) / hoja inferior (móvil) */}
      {showPanel && (
        <aside
          className={`glass absolute z-20 flex animate-slide-right flex-col overflow-hidden rounded-2xl ${
            desktop
              ? 'top-[72px] bottom-[96px] left-3 w-[380px]'
              : 'inset-x-2 bottom-[calc(84px+env(safe-area-inset-bottom))] h-[min(58vh,560px)]'
          }`}
        >
          <SidePanel
            view={view}
            canGoBack={stack.length > 1}
            onBack={back}
            onClose={() => setPanelOpen(false)}
            countries={countries}
            countriesLoading={countriesLoading}
            countriesError={countriesError}
            onRetryCountries={loadCountries}
            onSelectCountry={selectCountry}
            favorites={fav.favorites}
            geoStations={geo.stations}
            actions={actions}
          />
        </aside>
      )}

      {/* Botón para mostrar/ocultar el panel */}
      <button
        onClick={() => setPanelOpen((o) => !o)}
        className={`glass absolute z-20 grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-slate-200 hover:text-signal ${
          desktop ? (showPanel ? 'top-[72px] left-[400px]' : 'top-[72px] left-3') : showPanel ? 'hidden' : 'bottom-[calc(96px+env(safe-area-inset-bottom))] left-3'
        }`}
        aria-label={showPanel ? 'Ocultar panel' : 'Mostrar países y emisoras'}
        title={showPanel ? 'Ocultar panel' : 'Países y emisoras'}
      >
        {desktop ? showPanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} /> : <List size={18} />}
      </button>

      {/* Controles del planeta y exploración */}
      {(desktop || !showPanel) && (
        <div className="pointer-events-none absolute right-3 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20">
          <GlobeControls
            onZoomIn={() => globeApi.current?.zoomIn()}
            onZoomOut={() => globeApi.current?.zoomOut()}
            onReset={() => globeApi.current?.reset()}
            onExplore={() => void explore()}
            exploring={exploring}
            hasExplored={hasExplored}
            loadedCount={geo.stations.length}
            loadingStations={geo.loading}
            stationsError={geo.error}
            onRetryStations={() => void geo.retry()}
          />
        </div>
      )}

      {/* Avisos */}
      <div className="pointer-events-none absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+56px)] right-3 z-40 w-[min(92vw,380px)]">
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </div>

      {/* Reproductor permanente */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3">
        <PlayerBar
          player={player}
          isFavorite={player.station ? fav.isFavorite(player.station.uuid) : false}
          onToggleFavorite={() => player.station && actions.onToggleFavorite(player.station)}
          onNext={() => void explore()}
          onShowStation={() => {
            if (!player.station) return
            push({ kind: 'station', station: player.station })
            locate(player.station, false)
          }}
          approximate={!!current?.loc.approximate}
        />
      </footer>
    </div>
  )
}
