# Radio World 3D

Explora la Tierra en 3D y escucha **emisoras de radio reales en directo** de todo el mundo.
Los datos de las emisoras provienen de [Radio Browser](https://www.radio-browser.info/), una base de datos
comunitaria y abierta; el audio se reproduce directamente desde las URL de streaming de cada emisora.

## Requisitos

- Node.js 20.19 o superior (recomendado 22 LTS)
- npm 10+

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre <http://localhost:5173> en el navegador.

### Compilar para producción

```bash
npm run build      # genera la carpeta dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

## Despliegue

`dist/` es un sitio estático (rutas relativas, `base: './'`), así que puede publicarse en Netlify, Vercel,
GitHub Pages, Cloudflare Pages, un bucket S3 o cualquier servidor web:

- **Netlify / Cloudflare Pages:** comando de build `npm run build`, carpeta de publicación `dist`.
- **Vercel:** framework «Vite» (se detecta automáticamente).
- **GitHub Pages / servidor propio:** sube el contenido de `dist/`.

> **HTTPS y emisoras HTTP.** En un sitio publicado con HTTPS los navegadores bloquean el audio servido por
> HTTP sin cifrar (contenido mixto). La aplicación intenta automáticamente la versión `https://` de esas
> emisoras y, si el servidor no la ofrece, muestra un aviso para elegir otra. En local (`http://localhost`)
> todas las emisoras pueden sonar. El botón «Explorar el mundo» prioriza emisoras HTTPS cuando la página
> se sirve por HTTPS.

## Funciones

| Área | Detalles |
| --- | --- |
| Globo 3D | three.js + react-globe.gl, textura Blue Marble, relieve, reflejo especular en océanos, atmósfera, campo de estrellas, fronteras de países, rotación automática que se detiene al interactuar, zoom con rueda/pellizco, transiciones cinematográficas. |
| Emisoras en el mapa | Puntos verdes luminosos con agrupación dinámica según el zoom; solo se procesan los puntos del hemisferio visible. Al pulsar un grupo se acerca la cámara; si todas están en el mismo lugar se listan en el panel. |
| Carga progresiva | Las emisoras con coordenadas se descargan por páginas de 500 (las más populares primero, hasta 6000) y se guardan en caché local 12 h. Las listas del panel se paginan de 50 en 50. |
| Ubicación aproximada | Si una emisora no tiene coordenadas, se usa el centro del país y se indica claramente («≈ aprox.», anillo ámbar en el globo). Nunca se inventa una posición exacta. |
| Países | Panel con todos los países de la API, búsqueda por nombre, filtros por idioma y género, orden por popularidad, votos, tendencia, calidad o nombre. |
| Buscador | Sugerencias en vivo de países, ciudades, regiones, emisoras, géneros e idiomas (tecla `/` para enfocar). |
| Reproductor | HTML5 Audio + hls.js (cargado bajo demanda) para HLS; Safari usa HLS nativo. Play/pausa, volumen, silencio, indicador EN VIVO, estado de conexión, favoritos, controles del sistema (Media Session). Al reanudar se reconecta al directo. |
| Errores | Timeouts, reintentos limitados y rotación entre servidores espejo de Radio Browser; avisos comprensibles si la API o una emisora fallan. |
| Favoritos | «Mis emisoras», guardadas en `localStorage` y sincronizadas entre pestañas. |
| Explorar el mundo | Emisora aleatoria real (`order=random`), viaje de cámara a su ubicación y reproducción; botón «Siguiente emisora». |

## Estructura

```
src/
  App.tsx                 Composición de la interfaz y lógica principal
  components/
    GlobeView.tsx         Globo 3D, capas de países, puntos agrupados, anillos y estrellas
    SidePanel.tsx         Panel de países / emisoras / filtros / favoritos
    StationDetail.tsx     Ficha de una emisora
    SearchBox.tsx         Buscador mundial con sugerencias
    PlayerBar.tsx         Reproductor permanente
    GlobeControls.tsx     Zoom, vista mundial y exploración aleatoria
  hooks/
    useAudioPlayer.ts     Reproducción HTML5/HLS con estados y manejo de errores
    useGeoStations.ts     Carga progresiva y caché de emisoras con coordenadas
    useStationQuery.ts    Búsquedas paginadas
    useFavorites.ts       Favoritos en localStorage
  lib/
    radioBrowser.ts       Cliente de la API (servidores espejo, timeout, reintentos, caché)
    geo.ts                Centros de países, agrupación, distancias
  data/
    countryCentroids.json Centros y tamaño de cada país (Natural Earth)
    cities.ts             Ciudades destacadas con sus coordenadas
public/
  textures/               Texturas de la Tierra (three-globe, NASA Blue Marble)
  data/countries.geojson  Fronteras simplificadas (Natural Earth 1:110m)
scripts/prepare-geo.mjs   Regenera los datos geográficos a partir de Natural Earth
```

## Uso responsable de los datos

- La aplicación usa los servidores públicos de Radio Browser, distribuye la carga entre sus espejos,
  pagina y cachea las consultas y registra las escuchas en `/json/url/{uuid}` como pide su documentación.
- No se evitan bloqueos geográficos ni restricciones de las emisoras: si una transmisión no está disponible
  en tu región o navegador, se informa y puedes elegir otra.
- Las banderas se cargan desde [flagcdn.com](https://flagcdn.com); los mapas son de
  [Natural Earth](https://www.naturalearthdata.com/) (dominio público).
