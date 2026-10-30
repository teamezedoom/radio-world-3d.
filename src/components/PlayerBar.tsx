import { AlertTriangle, Heart, Loader2, Pause, Play, SkipForward, Volume1, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import type { AudioPlayer } from '../hooks/useAudioPlayer'
import { countryName } from '../lib/geo'
import Flag from './Flag'
import StationLogo from './StationLogo'

const STATUS_TEXT = {
  idle: 'Listo',
  connecting: 'Conectando…',
  buffering: 'Cargando señal…',
  playing: 'Conectado',
  paused: 'En pausa',
  error: 'Sin señal',
  blocked: 'Pulsa ▶ para escuchar',
} as const

interface Props {
  player: AudioPlayer
  isFavorite: boolean
  onToggleFavorite: () => void
  onNext: () => void
  onShowStation: () => void
  approximate: boolean
}

export default function PlayerBar({ player, isFavorite, onToggleFavorite, onNext, onShowStation, approximate }: Props) {
  const { station: s, status, error, volume, muted } = player
  const playing = status === 'playing'
  const busy = status === 'connecting' || status === 'buffering'
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="glass pointer-events-auto mx-auto flex w-full max-w-6xl items-center gap-3 rounded-2xl px-3 py-2.5 sm:gap-4 sm:px-4">
      {/* Emisora */}
      <button
        onClick={onShowStation}
        disabled={!s}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-default"
      >
        {s ? (
          <StationLogo src={s.favicon} size={46} />
        ) : (
          <div className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <span className="h-2.5 w-2.5 rounded-full bg-signal/60 shadow-[0_0_12px_#39ff88]" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-sm font-semibold text-white sm:text-base">
              {s ? s.name : 'Elige una emisora en el globo'}
            </span>
            {s && (
              <span
                className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${
                  playing ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-slate-400'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${playing ? 'live-dot bg-rose-500' : 'bg-slate-500'}`} />
                EN VIVO
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 truncate text-xs text-slate-400">
            {s ? (
              <>
                {s.countryCode && <Flag code={s.countryCode} className="h-3 w-4" />}
                <span className="truncate">
                  {[s.state, countryName(s.countryCode, s.country)].filter(Boolean).join(', ')}
                  {approximate && <span className="text-amber-300"> · ubicación aprox.</span>}
                  {s.tags.length > 0 && <span className="hidden sm:inline"> · {s.tags.slice(0, 3).join(', ')}</span>}
                </span>
              </>
            ) : (
              <span>o pulsa “Explorar el mundo” para descubrir una al azar</span>
            )}
          </div>
          {error && (status === 'error' || status === 'blocked') && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-amber-300">
              <AlertTriangle size={11} className="shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
        </div>
      </button>

      {/* Estado de conexión */}
      {s && (
        <div className="hidden shrink-0 items-center gap-1.5 text-xs text-slate-400 lg:flex" title="Estado de conexión">
          {status === 'error' ? (
            <WifiOff size={14} className="text-rose-400" />
          ) : (
            <Wifi size={14} className={playing ? 'text-signal' : busy ? 'animate-pulse text-sky-300' : ''} />
          )}
          {STATUS_TEXT[status]}
          {playing && (
            <span className="eq ml-1 flex h-3.5 items-end text-signal">
              <span /> <span /> <span />
            </span>
          )}
        </div>
      )}

      {/* Controles */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          onClick={onToggleFavorite}
          disabled={!s}
          className={`hidden cursor-pointer rounded-full p-2 hover:bg-white/10 disabled:opacity-30 sm:block ${isFavorite ? 'text-rose-400' : 'text-slate-300'}`}
          aria-label={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          title={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        >
          <Heart size={19} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={player.toggle}
          disabled={!s}
          className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-signal text-space-950 shadow-[0_0_24px_-4px_rgba(57,255,136,0.8)] transition hover:scale-105 disabled:opacity-30 disabled:shadow-none"
          aria-label={playing || busy ? 'Pausar' : 'Reproducir'}
        >
          {busy ? <Loader2 size={20} className="animate-spin" /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={onNext}
          className="cursor-pointer rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"
          aria-label="Siguiente emisora"
          title="Siguiente emisora (aleatoria)"
        >
          <SkipForward size={19} />
        </button>
        <div className="ml-1 hidden items-center gap-2 md:flex">
          <button
            onClick={() => player.setMuted(!muted)}
            className="cursor-pointer rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            title={muted ? 'Activar sonido' : 'Silenciar'}
          >
            <VolumeIcon size={19} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            className="volume w-24 cursor-pointer"
            style={{ ['--v' as string]: `${(muted ? 0 : volume) * 100}%` }}
            aria-label="Volumen"
          />
        </div>
        <button
          onClick={() => player.setMuted(!muted)}
          className="cursor-pointer rounded-full p-2 text-slate-300 hover:bg-white/10 md:hidden"
          aria-label={muted ? 'Activar sonido' : 'Silenciar'}
        >
          <VolumeIcon size={19} />
        </button>
      </div>
    </div>
  )
}
