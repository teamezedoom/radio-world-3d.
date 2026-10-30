import { Compass, Loader2, Minus, Plus, Shuffle, SkipForward } from 'lucide-react'

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onExplore: () => void
  exploring: boolean
  hasExplored: boolean
  loadedCount: number
  loadingStations: boolean
  stationsError: string | null
  onRetryStations: () => void
}

const btn =
  'glass grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-slate-200 transition hover:text-signal active:scale-95'

export default function GlobeControls(p: Props) {
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      {(p.loadingStations || p.stationsError) && (
        <div className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] text-slate-300">
          {p.stationsError ? (
            <>
              <span className="text-amber-300">No se pudieron cargar todas las emisoras.</span>
              <button onClick={p.onRetryStations} className="cursor-pointer font-semibold text-signal hover:underline">
                Reintentar
              </button>
            </>
          ) : (
            <>
              <Loader2 size={12} className="animate-spin text-signal" />
              {p.loadedCount.toLocaleString('es')} emisoras en el mapa…
            </>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <button onClick={p.onZoomIn} className={btn} aria-label="Acercar" title="Acercar">
          <Plus size={18} />
        </button>
        <button onClick={p.onZoomOut} className={btn} aria-label="Alejar" title="Alejar">
          <Minus size={18} />
        </button>
        <button onClick={p.onReset} className={btn} aria-label="Vista mundial" title="Restablecer vista mundial">
          <Compass size={18} />
        </button>
      </div>
      {p.hasExplored && (
        <button
          onClick={p.onExplore}
          disabled={p.exploring}
          className="glass flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-slate-100 transition hover:text-signal active:scale-95 disabled:opacity-60"
        >
          <SkipForward size={15} /> Siguiente emisora
        </button>
      )}
      <button
        onClick={p.onExplore}
        disabled={p.exploring}
        className="flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-signal px-4 py-2.5 font-display text-sm font-semibold text-space-950 shadow-[0_0_30px_-6px_rgba(57,255,136,0.9)] transition hover:brightness-110 active:scale-95 disabled:opacity-70"
      >
        {p.exploring ? <Loader2 size={17} className="animate-spin" /> : <Shuffle size={17} />}
        Explorar el mundo
      </button>
    </div>
  )
}
