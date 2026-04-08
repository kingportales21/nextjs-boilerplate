# Carwow España · Detector de momentos virales

Herramienta interna para el equipo de redes de **Carwow España**. Pega la URL
de un video largo de YouTube (del canal de **JF Calero**) y devuelve los
mejores momentos para cortar como Shorts / TikToks / Reels, con timestamp,
descripción y un score de viralidad.

No genera videos ni subtítulos: solo identifica los momentos. El corte y la
subida a redes los hace el equipo manualmente.

## Cómo detecta los momentos (pipeline híbrido)

Combina tres señales y las pasa a un LLM para que las unifique:

1. **Most Replayed de YouTube** — el heatmap real de usuarios que rebobinaron
   esa parte del video. Se extrae haciendo scraping del HTML de la página
   `watch` (no está en la Data API oficial). Es la señal más fuerte.
2. **Transcript con timestamps** — se baja vía `youtube-transcript`,
   priorizando español (Carwow España), con fallback a inglés y a cualquier
   idioma disponible.
3. **Metadatos del video** — título, canal y descripción para dar contexto
   temático al modelo.

El modelo (Gemini por defecto, Claude Sonnet 4.6 como alternativa) recibe las
tres señales, identifica los fragmentos donde coinciden (por ejemplo, un pico
del heatmap alineado con una reacción de JF Calero en el transcript) y
devuelve entre 3 y 6 momentos ordenados por score, con título, descripción y
razón — todo en castellano.

## Proveedores de IA

| Proveedor | Modelo por defecto | Cuándo usarlo |
|---|---|---|
| **Gemini** *(por defecto)* | `gemini-2.5-flash` | Rápido, barato y con un contexto enorme (1M tokens) — ideal para videos largos. |
| **Claude** | `claude-sonnet-4-6` | Alternativa de alta calidad si Gemini da resultados flojos. |

Se cambia con la variable `AI_PROVIDER` (`gemini` o `claude`).

## Puesta en marcha local

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env.local` y añade la clave del proveedor que
   vayas a usar:

   ```bash
   cp .env.example .env.local
   ```

   - Para Gemini: obtén una clave gratuita en <https://aistudio.google.com/apikey>
     y ponla en `GEMINI_API_KEY`.
   - Para Claude: obtén una en <https://console.anthropic.com/> y ponla en
     `ANTHROPIC_API_KEY`, y pon `AI_PROVIDER=claude`.

3. Arranca el servidor:

   ```bash
   npm run dev
   ```

4. Abre <http://localhost:3000>, pega la URL de un video y pulsa **Analizar**.

## Deploy a producción (Vercel)

Esta app es una Next.js estándar, así que el camino más rápido es Vercel:

1. Ve a <https://vercel.com/new> y conecta el repo
   `kingportales21/nextjs-boilerplate`.
2. En **Configure Project → Environment Variables**, añade las que uses:
   - `AI_PROVIDER` = `gemini` (o `claude`)
   - `GEMINI_API_KEY` = tu clave
   - (opcional) `GEMINI_MODEL` = `gemini-2.5-flash` o `gemini-2.5-pro`
   - `ANTHROPIC_API_KEY` = sólo si usas Claude
3. Pulsa **Deploy**. En ~1 min te da una URL pública (`https://<nombre>.vercel.app`).
4. En cada push a `main`, Vercel re-despliega automáticamente. Para subir una
   versión estable, abre un PR desde `claude/detect-video-peaks-9Ed9I` a
   `main` y hazle merge.

Vercel eleva el timeout de las funciones serverless a 60s en el plan gratuito
y 300s en Pro. El pipeline está configurado con `maxDuration = 120`, así que
en Pro corre sin problemas; en el plan gratuito videos muy largos pueden
recortarse al límite de 60s.

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `AI_PROVIDER` | no | `gemini` (por defecto) o `claude`. |
| `GEMINI_API_KEY` | sí (si usas Gemini) | Clave de Google AI Studio. |
| `GEMINI_MODEL` | no | Por defecto `gemini-2.5-flash`. |
| `ANTHROPIC_API_KEY` | sí (si usas Claude) | Clave de la API de Anthropic. |
| `ANTHROPIC_MODEL` | no | Por defecto `claude-sonnet-4-6`. |

## Estructura

```
app/
  api/analyze/route.ts   # POST /api/analyze — pipeline completo
  lib/youtube.ts         # metadata + scraping del heatmap Most Replayed
  lib/transcript.ts      # bajar y formatear transcripts con timestamps
  lib/analyzer.ts        # prompt, proveedores (Gemini/Claude) y parsing del JSON
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
  transcript, no lo detectará. Se puede añadir análisis de audio con ffmpeg
  más adelante si hace falta.
