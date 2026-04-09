# Carwow España · Detector de momentos virales

Herramienta interna para el equipo de redes de **Carwow España**. Pega la URL
de un video largo de YouTube (del canal de **JF Calero**) y devuelve los
mejores momentos para cortar como Shorts / TikToks / Reels, con timestamp,
descripción y un score de viralidad.

No genera videos ni subtítulos: solo identifica los momentos. El corte y la
subida a redes los hace el equipo manualmente.

## Cómo funciona

Le pasamos la URL del video directamente a **Gemini** vía `fileData.fileUri`.
Gemini fetchea el video desde la infraestructura de Google (no scrapeamos
YouTube nosotros), lo procesa entero — imagen, audio y subtítulos — e
identifica los mejores momentos virales.

Esto es importante porque YouTube bloquea el scraping desde IPs de datacenter
(Vercel, AWS, etc.) con un muro "LOGIN_REQUIRED / Inicia sesión para confirmar
que no eres un bot" desde 2024. Delegando la ingesta del video a Gemini
evitamos por completo ese bloqueo, y como bonus el modelo tiene acceso al
**video real** en lugar de solo al transcript: detecta momentos puramente
visuales (caras de sorpresa de JF Calero, derrapes, sonido del motor) que un
pipeline solo de texto perdería.

Para los metadatos del video (título, canal, miniatura) usamos el endpoint
público **oEmbed** de YouTube, que sí responde desde IPs de datacenter porque
está pensado para sites que embeben videos.

## Puesta en marcha local

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env.local` y añade tu clave de Gemini:

   ```bash
   cp .env.example .env.local
   ```

   La clave gratuita se obtiene en <https://aistudio.google.com/apikey>.

3. Arranca el servidor:

   ```bash
   npm run dev
   ```

4. Abre <http://localhost:3000>, pega la URL de un video y pulsa **Analizar**.

## Deploy a producción (Vercel)

1. Ve a <https://vercel.com/new> y conecta el repo
   `kingportales21/nextjs-boilerplate`.
2. En **Settings → Environment Variables**, añade:
   - `GEMINI_API_KEY` = tu clave (marca **Sensitive**)
   - *(opcional)* `GEMINI_MODEL` = por defecto `gemini-3.1-pro-preview`
3. Pulsa **Deploy**.

Vercel re-despliega automáticamente en cada push. El timeout de las funciones
serverless está configurado en 300 segundos (necesario para videos largos —
funciona en plan Pro; en el plan Hobby se queda en 60s y los videos largos se
cortarán).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GEMINI_API_KEY` | sí | Clave de Google AI Studio. |
| `GEMINI_MODEL` | no | Por defecto `gemini-3.1-pro-preview` (el modelo más inteligente, prioriza calidad sobre velocidad). Alternativas más rápidas y baratas: `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`. |

## Estructura

```
app/
  api/analyze/route.ts   # POST /api/analyze — endpoint principal
  lib/youtube.ts         # parseo de URLs + metadata vía oEmbed
  lib/analyzer.ts        # llamada a Gemini con fileData.fileUri
  page.tsx               # UI: input de URL + lista de momentos
```

## Limitaciones

- **Coste por video**: cada análisis consume tokens de video en Gemini.
  Con `gemini-3.1-pro-preview` (default) puede costar $0.30–$1.50 por video
  según duración. Si quieres abaratar, pasa a `gemini-3-flash-preview` o
  `gemini-2.5-flash` (~$0.03–$0.10 por video) a costa de precisión.
- **Tiempo de procesamiento**: 2–6 minutos con el modelo Pro según la
  duración del video (el Pro prioriza calidad sobre velocidad).
- **Videos privados o age-restricted**: Gemini no podrá ingerirlos.
