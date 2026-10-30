import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import * as THREE from 'three'
import { centroids, clusterStations, countryName, type Cluster } from '../lib/geo'
import type { Country, Located, Station } from '../types'

export interface GlobeApi {
  flyTo: (lat: number, lng: number, altitude: number, cinematic?: boolean) => void
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
}

interface CountryFeature {
  type: 'Feature'
  properties: { code: string; name: string }
  geometry: unknown
}

interface Props {
  apiRef: RefObject<GlobeApi | null>
  width: number
  height: number
  offset: [number, number]
  stations: Station[]
  countries: Map<string, Country>
  selectedCountry: string | null
  current: { station: Station; loc: Located } | null
  isPlaying: boolean
  onCountryClick: (code: string) => void
  onStationClick: (s: Station) => void
  onClusterList: (c: Cluster) => void
}

const POINT_TIERS = ['#39ff88', '#5cffa0', '#86ffbb', '#b5ffd6']
const HOME = { lat: 18, lng: -40, altitude: 2.4 }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Tamaño de celda de agrupación (grados) según la altitud de la cámara. */
const cellForAltitude = (alt: number) => Math.min(5, Math.max(0.015, alt * 1.5))
/** Radio angular visible desde la cámara (hasta el horizonte). */
const horizonDeg = (alt: number) => (Math.acos(1 / (1 + alt)) * 180) / Math.PI + 6

function makeStars(): THREE.Points {
  const count = 2200
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 2500 + Math.random() * 1500
    const u = Math.random() * 2 - 1
    const t = Math.random() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3)
    const b = 0.35 + Math.random() * 0.5
    col.set([b * 0.85, b * 0.92, b], i * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8 })
  const pts = new THREE.Points(g, m)
  pts.name = 'stars'
  return pts
}

export default function GlobeView(p: Props) {
  const globe = useRef<GlobeMethods | undefined>(undefined)
  const [features, setFeatures] = useState<CountryFeature[]>([])
  const [hovered, setHovered] = useState<CountryFeature | null>(null)
  const [view, setView] = useState({ ...HOME })
  const idleTimer = useRef<number | undefined>(undefined)
  const zoomTimer = useRef<number | undefined>(undefined)
  const flightTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    fetch('./data/countries.geojson')
      .then((r) => r.json())
      .then((g: { features: CountryFeature[] }) => setFeatures(g.features))
      .catch(() => setFeatures([]))
  }, [])

  const material = useMemo(() => {
    const m = new THREE.MeshPhongMaterial({ shininess: 18, specular: new THREE.Color('#2a3d5c') })
    new THREE.TextureLoader().load('./textures/earth-water.png', (t) => {
      m.specularMap = t
      m.needsUpdate = true
    })
    return m
  }, [])

  const stopAutoRotate = useCallback((resumeAfter = 30_000) => {
    const c = globe.current?.controls()
    if (!c) return
    c.autoRotate = false
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => {
      const pov = globe.current?.pointOfView()
      if (pov && pov.altitude > 1.6) c.autoRotate = true
    }, resumeAfter)
  }, [])

  const onReady = useCallback(() => {
    const g = globe.current
    if (!g) return
    const c = g.controls()
    c.autoRotate = true
    c.autoRotateSpeed = 0.35
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.zoomSpeed = 0.9
    c.rotateSpeed = 0.6
    c.addEventListener('start', () => stopAutoRotate())
    g.scene().add(makeStars())
    g.pointOfView(HOME, 0)
  }, [stopAutoRotate])

  // API imperativa para el resto de la interfaz.
  useEffect(() => {
    p.apiRef.current = {
      flyTo: (lat, lng, altitude, cinematic = true) => {
        const g = globe.current
        if (!g) return
        stopAutoRotate(60_000)
        window.clearTimeout(flightTimer.current)
        const pov = g.pointOfView()
        const far = Math.abs(pov.lat - lat) + Math.abs(((pov.lng - lng + 540) % 360) - 180) > 30
        if (cinematic && far && pov.altitude < 1.8) {
          // Transición cinematográfica: primero se aleja, luego viaja y desciende.
          g.pointOfView({ altitude: 2.1 }, 700)
          flightTimer.current = window.setTimeout(() => g.pointOfView({ lat, lng, altitude }, 1900), 650)
        } else {
          g.pointOfView({ lat, lng, altitude }, cinematic ? 1700 : 900)
        }
      },
      zoomIn: () => {
        const g = globe.current
        if (!g) return
        stopAutoRotate()
        const pov = g.pointOfView()
        g.pointOfView({ altitude: Math.max(0.03, pov.altitude * 0.55) }, 500)
      },
      zoomOut: () => {
        const g = globe.current
        if (!g) return
        stopAutoRotate()
        const pov = g.pointOfView()
        g.pointOfView({ altitude: Math.min(4.5, pov.altitude * 1.8) }, 500)
      },
      reset: () => {
        const g = globe.current
        if (!g) return
        g.pointOfView(HOME, 1500)
        const c = g.controls()
        window.clearTimeout(idleTimer.current)
        window.setTimeout(() => (c.autoRotate = true), 1600)
      },
    }
  }, [p.apiRef, stopAutoRotate])

  // Recalcula la agrupación solo cuando el zoom o la posición cambian de forma apreciable.
  const onZoom = useCallback((pov: { lat: number; lng: number; altitude: number }) => {
    window.clearTimeout(zoomTimer.current)
    zoomTimer.current = window.setTimeout(() => {
      setView((prev) => {
        const altRatio = pov.altitude / prev.altitude
        const moved = Math.abs(pov.lat - prev.lat) + Math.abs(pov.lng - prev.lng)
        if (altRatio > 0.8 && altRatio < 1.25 && moved < horizonDeg(pov.altitude) * 0.2) return prev
        return { lat: pov.lat, lng: pov.lng, altitude: pov.altitude }
      })
    }, 120)
  }, [])

  const cell = cellForAltitude(view.altitude)
  const clusters = useMemo(
    () => clusterStations(p.stations, cell, { lat: view.lat, lng: view.lng, radiusDeg: horizonDeg(view.altitude) }),
    [p.stations, cell, view],
  )
  const maxWeight = useMemo(() => clusters.reduce((m, c) => Math.max(m, c.weight), 1), [clusters])

  const polygonCodes = useMemo(() => new Set(features.map((f) => f.properties.code)), [features])

  // Países pequeños que no tienen polígono a esta escala: se marcan con un punto y su nombre.
  const smallCountries = useMemo(
    () =>
      [...p.countries.values()]
        .filter((c) => !polygonCodes.has(c.code) && centroids[c.code])
        .map((c) => ({ ...centroids[c.code], code: c.code, name: countryName(c.code, c.name), count: c.stationcount })),
    [p.countries, polygonCodes],
  )

  const { current } = p
  const rings = useMemo(
    () => (current ? [{ lat: current.loc.lat, lng: current.loc.lng, approx: current.loc.approximate }] : []),
    [current],
  )

  const pointLabel = useCallback(
    (o: object) => {
      const c = o as Cluster
      if (c.stations.length === 1) {
        const s = c.stations[0]
        const place = [s.state, countryName(s.countryCode, s.country)].filter(Boolean).join(', ')
        return `<div class="globe-tip"><b>${esc(s.name)}</b><br/><small>${esc(place)}</small></div>`
      }
      const names = c.stations
        .slice(0, 3)
        .map((s) => esc(s.name))
        .join('<br/>')
      return `<div class="globe-tip"><b>${c.stations.length} emisoras</b><br/><small>${names}${c.stations.length > 3 ? '<br/>…' : ''}</small></div>`
    },
    [],
  )

  const handlePointClick = useCallback(
    (o: object) => {
      const c = o as Cluster
      stopAutoRotate()
      if (c.stations.length === 1) return p.onStationClick(c.stations[0])
      // Si las emisoras están en el mismo punto (misma ciudad) no tiene sentido seguir acercando.
      const spread = c.stations.reduce(
        (m, s) => Math.max(m, Math.abs((s.lat ?? 0) - c.lat) + Math.abs((s.lng ?? 0) - c.lng)),
        0,
      )
      const alt = globe.current?.pointOfView().altitude ?? 1
      if (spread < 0.05 || alt < 0.08) {
        p.onClusterList(c)
        globe.current?.pointOfView({ lat: c.lat, lng: c.lng, altitude: Math.max(0.05, Math.min(alt, 0.3)) }, 1200)
      } else {
        globe.current?.pointOfView({ lat: c.lat, lng: c.lng, altitude: Math.max(0.04, alt * 0.4) }, 1200)
      }
    },
    [p, stopAutoRotate],
  )

  const sel = p.selectedCountry
  return (
    <Globe
      ref={globe}
      width={p.width}
      height={p.height}
      globeOffset={p.offset}
      backgroundColor="rgba(0,0,0,0)"
      globeImageUrl="./textures/earth-blue-marble.jpg"
      bumpImageUrl="./textures/earth-topology.png"
      globeMaterial={material}
      showAtmosphere
      atmosphereColor="#4aa8ff"
      atmosphereAltitude={0.2}
      onGlobeReady={onReady}
      onZoom={onZoom}
      onGlobeClick={() => stopAutoRotate()}
      /* Países y fronteras */
      polygonsData={features}
      polygonGeoJsonGeometry={(f: object) => (f as CountryFeature).geometry as never}
      polygonAltitude={(f: object) => ((f as CountryFeature).properties.code === sel ? 0.012 : 0.006)}
      polygonCapColor={(f: object) => {
        const code = (f as CountryFeature).properties.code
        if (code === sel) return 'rgba(57,255,136,0.16)'
        if (f === hovered) return 'rgba(120,190,255,0.14)'
        return 'rgba(0,0,0,0)'
      }}
      polygonSideColor={() => 'rgba(0,0,0,0)'}
      polygonStrokeColor={(f: object) =>
        (f as CountryFeature).properties.code === sel ? 'rgba(57,255,136,0.85)' : 'rgba(170,205,255,0.32)'
      }
      polygonsTransitionDuration={250}
      polygonLabel={(f: object) => {
        const { code, name } = (f as CountryFeature).properties
        const n = p.countries.get(code)?.stationcount
        return `<div class="globe-tip"><b>${esc(countryName(code, name))}</b><br/><small>${n ? `${n.toLocaleString('es')} emisoras` : 'Sin emisoras registradas'}</small></div>`
      }}
      onPolygonHover={(f) => setHovered(f as CountryFeature | null)}
      onPolygonClick={(f) => p.onCountryClick((f as CountryFeature).properties.code)}
      /* Emisoras (agrupadas) */
      pointsData={clusters}
      pointLat="lat"
      pointLng="lng"
      pointColor={(o: object) => {
        const c = o as Cluster
        if (current && c.stations.some((s) => s.uuid === current.station.uuid)) return '#ffffff'
        // Pocos tonos fijos: cada color distinto crea un material en three-globe.
        const t = Math.min(1, c.weight / maxWeight)
        return c.stations.length === 1 ? '#39ff88' : POINT_TIERS[Math.min(POINT_TIERS.length - 1, Math.floor(t * POINT_TIERS.length))]
      }}
      pointAltitude={(o: object) => Math.min(0.05, 0.003 + 0.009 * Math.log10(1 + (o as Cluster).stations.length))}
      pointRadius={(o: object) =>
        Math.min(1.3, Math.max(0.035, cell * 0.14 * (1 + 0.55 * Math.log10((o as Cluster).stations.length))))
      }
      pointResolution={8}
      pointsTransitionDuration={0}
      pointLabel={pointLabel}
      onPointClick={handlePointClick}
      /* Emisora sonando */
      ringsData={rings}
      ringColor={(r: object) => {
        const approx = (r as { approx: boolean }).approx
        return (t: number) => (approx ? `rgba(255,190,80,${1 - t})` : `rgba(57,255,136,${1 - t})`)
      }}
      ringMaxRadius={Math.max(0.6, cell * 1.2)}
      ringPropagationSpeed={p.isPlaying ? Math.max(0.4, cell) : 0.2}
      ringRepeatPeriod={p.isPlaying ? 1100 : 2400}
      ringAltitude={0.008}
      /* Países pequeños sin polígono */
      labelsData={smallCountries}
      labelLat="lat"
      labelLng="lng"
      labelText={(o: object) => (view.altitude < 1 ? (o as { name: string }).name : '')}
      labelSize={Math.min(0.9, Math.max(0.12, view.altitude * 0.35))}
      labelDotRadius={Math.min(0.5, Math.max(0.05, view.altitude * 0.12))}
      labelColor={(o: object) => ((o as { code: string }).code === sel ? '#39ff88' : 'rgba(170,205,255,0.75)')}
      labelResolution={2}
      labelAltitude={0.007}
      labelLabel={(o: object) => {
        const c = o as { name: string; count: number }
        return `<div class="globe-tip"><b>${esc(c.name)}</b><br/><small>${c.count.toLocaleString('es')} emisoras</small></div>`
      }}
      onLabelClick={(o: object) => p.onCountryClick((o as { code: string }).code)}
    />
  )
}
