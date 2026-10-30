import { RadioTower } from 'lucide-react'
import { useState } from 'react'

/** Logotipo de la emisora con icono de respaldo si no existe o no carga. */
export default function StationLogo({ src, size = 40 }: { src: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  // En HTTPS se intenta la versión segura del logotipo para evitar contenido mixto.
  const url = src && location.protocol === 'https:' ? src.replace(/^http:/i, 'https:') : src
  const style = { width: size, height: size }
  if (!url || failed)
    return (
      <div
        style={style}
        className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-sky-500/10 text-signal ring-1 ring-white/10"
      >
        <RadioTower size={size * 0.5} strokeWidth={1.6} />
      </div>
    )
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      style={style}
      className="shrink-0 rounded-xl bg-white/5 object-contain ring-1 ring-white/10"
      onError={() => setFailed(true)}
    />
  )
}
