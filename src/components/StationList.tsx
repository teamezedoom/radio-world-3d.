import { Heart, Loader2, LocateFixed, MapPin, Play, Trash2 } from 'lucide-react'
import { countryName } from '../lib/geo'
import type { PlayerStatus } from '../hooks/useAudioPlayer'
import type { Station } from '../types'
import StationLogo from './StationLogo'

interface Props {
  stations: Station[]
  currentId: string | null
  status: PlayerStatus
  onPlay: (s: Station) => void
  onLocate?: (s: Station) => void
  isFavorite: (id: string) => boolean
  onToggleFavorite: (s: Station) => void
  removable?: boolean
  showCountry?: boolean
}

export function StationRow(p: Omit<Props, 'stations'> & { station: Station }) {
  const s = p.station
  const active = p.currentId === s.uuid
  const fav = p.isFavorite(s.uuid)
  const busy = active && (p.status === 'connecting' || p.status === 'buffering')
  const playing = active && p.status === 'playing'
  const place = [s.state, p.showCountry ? countryName(s.countryCode, s.country) : ''].filter(Boolean).join(' · ')
  return (
    <li
      className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${
        active ? 'bg-signal/10 ring-1 ring-signal/30' : 'hover:bg-white/5'
      }`}
    >
      <button
        onClick={() => p.onPlay(s)}
        className="relative shrink-0 cursor-pointer"
        aria-label={`Escuchar ${s.name}`}
        title="Escuchar"
      >
        <StationLogo src={s.favicon} size={40} />
        <span
          className={`absolute inset-0 grid place-items-center rounded-xl bg-black/55 text-white transition-opacity ${
            busy || playing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {busy ? (
            <Loader2 size={18} className="animate-spin" />
          ) : playing ? (
            <span className="eq flex h-4 items-end text-signal">
              <span /> <span /> <span />
            </span>
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </span>
      </button>
      <button onClick={() => p.onPlay(s)} className="min-w-0 flex-1 cursor-pointer text-left">
        <div className={`truncate text-sm font-medium ${active ? 'text-signal' : 'text-slate-100'}`}>{s.name}</div>
        <div className="flex items-center gap-1.5 truncate text-xs text-slate-400">
          {s.lat === null && (
            <span
              className="shrink-0 rounded bg-amber-400/10 px-1 text-[10px] text-amber-300"
              title="Sin coordenadas exactas: se ubica en el centro del país"
            >
              ≈ aprox.
            </span>
          )}
          <span className="truncate">
            {[place, s.tags.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || s.codec || '—'}
          </span>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        {p.onLocate && (
          <button
            onClick={() => p.onLocate?.(s)}
            className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-sky-300"
            title={s.lat === null ? 'Ver ubicación aproximada' : 'Ver en el globo'}
            aria-label="Ver en el globo"
          >
            {s.lat === null ? <MapPin size={15} /> : <LocateFixed size={15} />}
          </button>
        )}
        <button
          onClick={() => p.onToggleFavorite(s)}
          className={`cursor-pointer rounded-lg p-1.5 hover:bg-white/10 ${
            p.removable ? 'text-slate-500 hover:text-rose-400' : fav ? 'text-rose-400' : 'text-slate-500 hover:text-rose-300'
          }`}
          title={p.removable ? 'Eliminar de Mis emisoras' : fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          aria-label={p.removable ? 'Eliminar' : 'Favorito'}
        >
          {p.removable ? <Trash2 size={15} /> : <Heart size={15} fill={fav ? 'currentColor' : 'none'} />}
        </button>
      </div>
    </li>
  )
}

export default function StationList(p: Props) {
  return (
    <ul className="space-y-0.5">
      {p.stations.map((s) => (
        <StationRow key={s.uuid} {...p} station={s} />
      ))}
    </ul>
  )
}
