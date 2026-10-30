import { useCallback, useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import { reportClick } from '../lib/radioBrowser'
import { readJSON, writeJSON } from '../lib/storage'
import type { Station } from '../types'

export type PlayerStatus = 'idle' | 'connecting' | 'playing' | 'buffering' | 'paused' | 'error' | 'blocked'

const CONNECT_TIMEOUT = 15_000
const VOLUME_KEY = 'rw3d:volume'

class PlaybackError extends Error {
  code: 'timeout' | 'media' | 'blocked' | 'unsupported' | 'network'
  constructor(message: string, code: PlaybackError['code']) {
    super(message)
    this.code = code
  }
}

const isHlsUrl = (url: string) => /\.m3u8($|\?)/i.test(url)

/**
 * Prepara las URL a probar. En páginas HTTPS el navegador bloquea el audio HTTP
 * (contenido mixto), así que solo se intenta la variante HTTPS del mismo servidor.
 */
function streamCandidates(s: Station): { urls: string[]; httpOnly: boolean } {
  const raw = [...new Set([s.url, s.urlOriginal].filter(Boolean))]
  const securePage = location.protocol === 'https:'
  const urls: string[] = raw.filter((u) => /^https:/i.test(u))
  const httpOnly = urls.length === 0
  for (const u of raw.filter((u) => /^http:/i.test(u))) urls.push(securePage ? 'https:' + u.slice(5) : u)
  return { urls: [...new Set(urls)], httpOnly: securePage && httpOnly }
}

function mediaErrorMessage(err: MediaError | null): PlaybackError {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return new PlaybackError('Error de red al conectar con la emisora.', 'network')
    case MediaError.MEDIA_ERR_DECODE:
      return new PlaybackError('No se pudo decodificar la transmisión.', 'media')
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return new PlaybackError(
        'La emisora no está disponible o su formato no es compatible con este navegador.',
        'unsupported',
      )
    default:
      return new PlaybackError('No se pudo reproducir la emisora.', 'media')
  }
}

export function useAudioPlayer(opts: { onNext?: () => void } = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const reqId = useRef(0)
  const live = useRef(false) // true cuando la transmisión ya arrancó
  const onNextRef = useRef(opts.onNext)
  useEffect(() => {
    onNextRef.current = opts.onNext
  })

  const [station, setStation] = useState<Station | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolumeState] = useState<number>(() => readJSON<number>(VOLUME_KEY, 0.8))
  const [muted, setMuted] = useState(false)

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'none'
      a.setAttribute('playsinline', '')
      audioRef.current = a
    }
    return audioRef.current
  }, [])

  const teardown = useCallback(() => {
    live.current = false
    hlsRef.current?.destroy()
    hlsRef.current = null
    const a = getAudio()
    a.pause()
    a.removeAttribute('src')
    a.load()
  }, [getAudio])

  /** Intenta conectar con una URL; resuelve cuando empieza a sonar. */
  const attempt = useCallback(
    (url: string, s: Station, id: number) =>
      new Promise<void>((resolve, reject) => {
        const a = getAudio()
        let settled = false
        const done = (err?: unknown) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          a.removeEventListener('playing', onPlaying)
          a.removeEventListener('error', onError)
          if (err) reject(err)
          else resolve()
        }
        const onPlaying = () => done()
        const onError = () => done(mediaErrorMessage(a.error))
        const timer = setTimeout(
          () => done(new PlaybackError('La emisora no responde (tiempo de espera agotado).', 'timeout')),
          CONNECT_TIMEOUT,
        )
        a.addEventListener('playing', onPlaying)
        a.addEventListener('error', onError)

        const start = () => {
          a.play().catch((e: DOMException) => {
            if (e?.name === 'NotAllowedError')
              done(new PlaybackError('El navegador necesita que pulses ▶ para empezar a escuchar.', 'blocked'))
            else if (e?.name === 'NotSupportedError') done(mediaErrorMessage(a.error))
            // AbortError: la carga fue reemplazada, lo gestiona el temporizador o el evento "error".
          })
        }

        const useHls = (s.hls || isHlsUrl(url)) && !a.canPlayType('application/vnd.apple.mpegurl')
        if (!useHls) {
          a.src = url
          start()
          return
        }
        // HLS en navegadores sin soporte nativo (Chrome, Firefox, Edge): hls.js bajo demanda.
        import('hls.js')
          .then(({ default: HlsCtor }) => {
            if (id !== reqId.current) return done(new PlaybackError('cancelado', 'media'))
            if (!HlsCtor.isSupported())
              return done(new PlaybackError('Este navegador no admite transmisiones HLS.', 'unsupported'))
            const hls = new HlsCtor({ enableWorker: true, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 1 })
            hlsRef.current = hls
            hls.on(HlsCtor.Events.ERROR, (_e, data) => {
              if (!data.fatal) return
              if (live.current) {
                live.current = false
                setStatus('error')
                setError('Se perdió la conexión con la emisora.')
              } else done(new PlaybackError('No se pudo cargar la transmisión HLS.', 'network'))
            })
            hls.on(HlsCtor.Events.MANIFEST_PARSED, start)
            hls.loadSource(url)
            hls.attachMedia(a)
          })
          .catch(() => done(new PlaybackError('No se pudo cargar el reproductor HLS.', 'unsupported')))
      }),
    [getAudio],
  )

  const play = useCallback(
    async (s: Station) => {
      const id = ++reqId.current
      teardown()
      setStation(s)
      setError(null)
      setStatus('connecting')

      const { urls, httpOnly } = streamCandidates(s)
      let lastErr: unknown = new PlaybackError('La emisora no tiene una URL de transmisión válida.', 'media')
      for (const url of urls) {
        try {
          await attempt(url, s, id)
          if (id !== reqId.current) return
          live.current = true
          setStatus('playing')
          reportClick(s.uuid)
          return
        } catch (e) {
          if (id !== reqId.current) return
          lastErr = e
          if (e instanceof PlaybackError && e.code === 'blocked') {
            setStatus('blocked')
            setError(e.message)
            return
          }
          hlsRef.current?.destroy()
          hlsRef.current = null
        }
      }
      if (id !== reqId.current) return
      teardown()
      setStatus('error')
      setError(
        httpOnly
          ? 'Esta emisora solo transmite por HTTP sin cifrar y el navegador la bloquea en páginas seguras (HTTPS).'
          : lastErr instanceof Error
            ? lastErr.message
            : 'No se pudo reproducir la emisora.',
      )
    },
    [attempt, teardown],
  )

  const pause = useCallback(() => {
    reqId.current++
    live.current = false
    const a = getAudio()
    a.pause()
    hlsRef.current?.stopLoad()
    setStatus('paused')
  }, [getAudio])

  /** Reanudar = reconectar, para volver al directo en lugar de reproducir audio retrasado. */
  const toggle = useCallback(() => {
    if (!station) return
    if (status === 'playing' || status === 'buffering' || status === 'connecting') pause()
    else void play(station)
  }, [pause, play, station, status])

  const stop = useCallback(() => {
    reqId.current++
    teardown()
    setStatus('idle')
  }, [teardown])

  // Eventos de la transmisión una vez en directo.
  useEffect(() => {
    const a = getAudio()
    const onWaiting = () => live.current && setStatus('buffering')
    const onPlaying = () => live.current && setStatus('playing')
    const onError = () => {
      if (!live.current) return
      live.current = false
      setStatus('error')
      setError('Se perdió la conexión con la emisora.')
    }
    const onPause = () => {
      // Pausa externa (auriculares, sistema operativo).
      if (live.current && !a.ended) {
        live.current = false
        setStatus('paused')
      }
    }
    a.addEventListener('waiting', onWaiting)
    a.addEventListener('playing', onPlaying)
    a.addEventListener('error', onError)
    a.addEventListener('pause', onPause)
    return () => {
      a.removeEventListener('waiting', onWaiting)
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('error', onError)
      a.removeEventListener('pause', onPause)
    }
  }, [getAudio])

  useEffect(() => {
    const a = getAudio()
    a.volume = volume
    a.muted = muted
  }, [getAudio, muted, volume])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v))
    setVolumeState(clamped)
    writeJSON(VOLUME_KEY, clamped)
    if (clamped > 0) setMuted(false)
  }, [])

  // Controles del sistema (pantalla de bloqueo, auriculares).
  useEffect(() => {
    if (!('mediaSession' in navigator) || !station) return
    try {
      const art = station.favicon.startsWith('https:') ? [{ src: station.favicon, sizes: '96x96' }] : []
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: [station.state, station.country].filter(Boolean).join(', ') || 'Radio World 3D',
        album: 'Radio World 3D · En vivo',
        artwork: art,
      })
      navigator.mediaSession.setActionHandler('play', () => void play(station))
      navigator.mediaSession.setActionHandler('pause', pause)
      navigator.mediaSession.setActionHandler('nexttrack', () => onNextRef.current?.())
    } catch {
      /* API no disponible del todo */
    }
  }, [pause, play, station])

  useEffect(() => () => teardown(), [teardown])

  return { station, status, error, volume, muted, play, pause, toggle, stop, setVolume, setMuted }
}

export type AudioPlayer = ReturnType<typeof useAudioPlayer>
