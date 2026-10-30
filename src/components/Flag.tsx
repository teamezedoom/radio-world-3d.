import { useState } from 'react'
import { flagEmoji, flagUrl } from '../lib/geo'

/** Bandera como imagen (las emojis de bandera no se ven en Windows); emoji como respaldo. */
export default function Flag({ code, className = 'h-4 w-6' }: { code: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!code || failed) return <span className="inline-block leading-none">{flagEmoji(code)}</span>
  return (
    <img
      src={flagUrl(code, 40)}
      srcSet={`${flagUrl(code, 80)} 2x`}
      alt=""
      loading="lazy"
      className={`${className} shrink-0 rounded-[3px] object-cover shadow ring-1 ring-white/10`}
      onError={() => setFailed(true)}
    />
  )
}
