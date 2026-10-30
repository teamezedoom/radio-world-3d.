import { ExternalLink, Heart, Languages, Loader2, MapPin, Music2, Pause, Play, ShieldAlert, Signal } from 'lucide-react'
import { countryName } from '../lib/geo'
import type { Station } from '../types'
import type { ListActions } from './SidePanel'
import Flag from './Flag'
import StationLogo from './StationLogo'

export default function StationDetail({
  station: s,
  actions: a,
  onSelectCountry,
}: {
  station: Station
  actions: ListActions
  onSelectCountry: (code: string) => void
}) {
  const active = a.currentId === s.uuid
  const playing = active && a.status === 'playing'
  const busy = active && (a.status === 'connecting' || a.status === 'buffering')
  const fav = a.isFavorite(s.uuid)
  const httpOnly = location.protocol === 'https:' && !/^https:/i.test(s.url) && !/^https:/i.test(s.urlOriginal)
  const homepage = /^https?:\/\//i.test(s.homepage) ? s.homepage : ''

  return (
    <div className="scroll-thin min-h-0 flex-1 animate-slide-up overflow-y-auto p-4">
      <div className="flex items-center gap-4">
        <StationLogo src={s.favicon} size={72} />
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight font-semibold text-white">{s.name}</h3>
          <button
            onClick={() => s.countryCode && onSelectCountry(s.countryCode)}
            className="mt-1 flex cursor-pointer items-center gap-1.5 text-sm text-slate-300 hover:text-signal"
          >
            {s.countryCode && <Flag code={s.countryCode} className="h-3.5 w-5" />}
            {[s.state, countryName(s.countryCode, s.country)].filter(Boolean).join(', ')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => a.onPlay(s)}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-signal py-2.5 font-semibold text-space-950 shadow-[0_0_24px_-4px_rgba(57,255,136,0.7)] transition hover:brightness-110"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          {busy ? 'Conectando…' : playing ? 'Pausar' : 'Escuchar en vivo'}
        </button>
        <button
          onClick={() => a.onToggleFavorite(s)}
          className={`cursor-pointer rounded-xl px-3 ring-1 ring-white/10 hover:bg-white/10 ${fav ? 'text-rose-400' : 'text-slate-300'}`}
          aria-label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          title={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        >
          <Heart size={18} fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex gap-3">
          <MapPin size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            <dt className="text-xs text-slate-500">Ubicación</dt>
            <dd className="text-slate-200">
              {s.lat !== null ? (
                <>Coordenadas registradas: {s.lat.toFixed(3)}, {s.lng!.toFixed(3)}</>
              ) : (
                <span className="text-amber-300">
                  Aproximada: la emisora no tiene coordenadas exactas y se muestra en el centro del país.
                </span>
              )}
              <button onClick={() => a.onLocate(s)} className="ml-2 cursor-pointer text-xs text-sky-300 hover:underline">
                Ver en el globo
              </button>
            </dd>
          </div>
        </div>
        {s.tags.length > 0 && (
          <div className="flex gap-3">
            <Music2 size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <div>
              <dt className="text-xs text-slate-500">Géneros</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {s.tags.map((t) => (
                  <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-300 ring-1 ring-white/10">
                    {t}
                  </span>
                ))}
              </dd>
            </div>
          </div>
        )}
        {s.languages.length > 0 && (
          <div className="flex gap-3">
            <Languages size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <div>
              <dt className="text-xs text-slate-500">Idioma</dt>
              <dd className="text-slate-200 capitalize">{s.languages.join(', ')}</dd>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <Signal size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            <dt className="text-xs text-slate-500">Transmisión</dt>
            <dd className="text-slate-200">
              {[s.codec, s.bitrate ? `${s.bitrate} kbps` : '', s.hls ? 'HLS' : ''].filter(Boolean).join(' · ') || 'Desconocida'}
              <span className="ml-2 text-xs text-slate-500">{s.clickcount.toLocaleString('es')} escuchas recientes</span>
            </dd>
          </div>
        </div>
        {httpOnly && (
          <div className="flex gap-3 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-200 ring-1 ring-amber-300/20">
            <ShieldAlert size={16} className="shrink-0" />
            Esta emisora solo publica una URL HTTP. Se intentará la versión segura; si el servidor no la ofrece, el
            navegador bloqueará el audio en esta página HTTPS.
          </div>
        )}
      </dl>

      {homepage && (
        <a
          href={homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-sky-300 hover:underline"
        >
          <ExternalLink size={14} /> Sitio web de la emisora
        </a>
      )}
      <p className="mt-6 text-[11px] text-slate-500">Datos de la comunidad Radio Browser (radio-browser.info).</p>
    </div>
  )
}
