/** Emisora normalizada a partir de la respuesta de Radio Browser. */
export interface Station {
  uuid: string
  name: string
  /** URL de streaming resuelta (url_resolved) o, si falta, la original. */
  url: string
  /** URL original registrada en Radio Browser. */
  urlOriginal: string
  homepage: string
  favicon: string
  tags: string[]
  country: string
  countryCode: string
  state: string
  languages: string[]
  codec: string
  bitrate: number
  hls: boolean
  /** Coordenadas reales registradas en Radio Browser (null si no existen). */
  lat: number | null
  lng: number | null
  votes: number
  clickcount: number
}

export interface Country {
  code: string
  name: string
  stationcount: number
}

export interface Located {
  lat: number
  lng: number
  /** true cuando no hay coordenadas exactas y se usa el centro del país. */
  approximate: boolean
}

export type PanelView =
  | { kind: 'countries' }
  | { kind: 'country'; code: string }
  | { kind: 'query'; title: string; subtitle?: string; params: Record<string, string> }
  | { kind: 'area'; title: string; subtitle?: string; stations: Station[] }
  | { kind: 'city'; name: string; countryCode: string; lat: number; lng: number }
  | { kind: 'favorites' }
  | { kind: 'station'; station: Station }
