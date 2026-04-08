# Carwow España · Detector de momentos virales

Herramienta interna para el equipo de redes de **Carwow España**. Pega la URL de
un video largo de YouTube y devuelve los mejores momentos para cortar como
Shorts / TikToks / Reels, con timestamp, descripción y un score de viralidad.

No genera videos ni subtítulos: solo identifica los momentos. El corte y la
subida a redes los hace el equipo manualmente.

## Cómo detecta los momentos (pipeline híbrido)

Combina tres señales y las pasa a Claude para que las unifique:

1. **Most Replayed de YouTube** — el heatmap real de usuarios que rebobinaron
   esa parte del video. Se extrae haciendo scraping del HTML de la página
   `watch` (no está en la Data API oficial). Es la señal más fuerte.
2. **Transcript con timestamps** — se baja via `youtube-transcript`, priorizando
   español (Carwow España), con fallback a inglés y a cualquier idioma
   disponible.
3. **Metadatos del video** — título, canal y descripción para dar contexto
   temático a Claude.

Claude (Opus 4.6 por defecto) recibe las tres señales, identifica los
fragmentos donde coinciden (por ejemplo, un pico del heatmap alineado con una
reacción del presentador en el transcript) y devuelve entre 3 y 6 momentos
ordenados por score, con título, descripción y razón — todo en castellano.

## Puesta en marcha

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env.local` y añade tu clave de Anthropic:

   ```bash
   cp .env.example .env.local
   ```

3. Arranca el servidor:

   ```bash
   npm run dev
   ```

4. Abre [http://localhost:3000](http://localhost:3000), pega la URL de un
   video y pulsa **Analizar**.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Obligatoria. Clave de la API de Anthropic. |
| `ANTHROPIC_MODEL` | Opcional. Por defecto `claude-opus-4-6`. Alternativas: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. |

## Estructura

```
app/
  api/analyze/route.ts   # POST /api/analyze — pipeline completo
  lib/youtube.ts         # metadata + scraping del heatmap Most Replayed
  lib/transcript.ts      # bajar y formatear transcripts con timestamps
  lib/claude.ts          # prompt y parsing de la respuesta JSON
  page.tsx               # UI: input de URL + lista de momentos
```

## Limitaciones

- **Sin Most Replayed**: los videos muy nuevos o con pocas vistas no tienen
  heatmap. La herramienta sigue funcionando sólo con transcript + metadata,
  pero la calidad baja.
- **Sin transcript**: los videos con subtítulos deshabilitados no se pueden
  analizar semánticamente. Si tampoco hay heatmap, el endpoint devuelve 422.
- **No analiza audio ni imagen**: si un momento viral es puramente visual (un
  golpe, un derrape silencioso) y no deja huella en el heatmap ni en el
  transcript, no lo detectará. Se puede añadir análisis de audio con ffmpeg si
  hace falta más adelante.
