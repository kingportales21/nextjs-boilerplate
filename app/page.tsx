"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Signals = { heatmap: boolean; transcript: boolean; metadata: boolean };

type ViralMoment = {
  startSec: number;
  endSec: number;
  title: string;
  description: string;
  score: number;
  reason: string;
  transcriptExcerpt: string;
  signals: Signals;
};

type VideoMetadata = {
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: number;
  thumbnailUrl: string;
};

type AnalyzeResponse = {
  metadata: VideoMetadata;
  moments: ViralMoment[];
  usedHeatmap: boolean;
  usedTranscript: boolean;
  transcriptAvailable: boolean;
  provider: "gemini" | "claude";
  model: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Error ${res.status}`);
      }
      setResult(data as AnalyzeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16 sm:py-24">
        <header className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Carwow España · Detector de momentos virales
          </span>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Encuentra los mejores momentos de un video para cortar Shorts y TikToks
          </h1>
          <p className="max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Pega la URL de un video del canal de YouTube. Analizamos el heatmap de{" "}
            <em>Most Replayed</em>, el transcript y el contexto del video con Claude para
            devolverte los fragmentos más virales con su timestamp.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <input
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
          />
          <button
            type="submit"
            disabled={loading || !url}
            className="rounded-lg bg-zinc-900 px-6 py-3 text-base font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Analizando…" : "Analizar"}
          </button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {loading && !result && (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Descargando heatmap, transcript y pasándoselo a Claude. Puede tardar entre
            20 y 60 segundos según la longitud del video…
          </div>
        )}

        {result && <Results data={result} />}
      </main>
    </div>
  );
}

function Results({ data }: { data: AnalyzeResponse }) {
  const { metadata, moments, usedHeatmap, transcriptAvailable, provider, model } = data;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={metadata.thumbnailUrl}
          alt={metadata.title}
          className="h-24 w-40 flex-none rounded-md object-cover"
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold leading-tight">{metadata.title}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {metadata.author} · {formatTime(metadata.lengthSeconds)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge active={usedHeatmap}>Most Replayed</Badge>
            <Badge active={transcriptAvailable}>Transcript</Badge>
            <Badge active>Metadata</Badge>
            <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              {provider} · {model}
            </span>
          </div>
        </div>
      </div>

      {moments.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Claude no encontró momentos suficientemente fuertes en este video.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {moments.map((m, idx) => (
            <MomentCard
              key={`${m.startSec}-${idx}`}
              rank={idx + 1}
              moment={m}
              videoId={metadata.videoId}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function MomentCard({
  rank,
  moment,
  videoId,
}: {
  rank: number;
  moment: ViralMoment;
  videoId: string;
}) {
  const duration = Math.round(moment.endSec - moment.startSec);
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(
    moment.startSec,
  )}s`;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold text-zinc-400">#{rank}</span>
          <h3 className="text-base font-semibold leading-snug">{moment.title}</h3>
        </div>
        <ScoreBadge score={moment.score} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          {formatTime(moment.startSec)} → {formatTime(moment.endSec)}
        </a>
        <span>· {duration}s</span>
        <SignalChips signals={moment.signals} />
      </div>

      <p className="text-sm text-zinc-700 dark:text-zinc-300">{moment.description}</p>

      {moment.transcriptExcerpt && (
        <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          “{moment.transcriptExcerpt}”
        </blockquote>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        <span className="font-semibold">Por qué:</span> {moment.reason}
      </p>
    </li>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
      : score >= 60
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tone}`}
    >
      {score}/100
    </span>
  );
}

function SignalChips({ signals }: { signals: Signals }) {
  const items: Array<[keyof Signals, string]> = [
    ["heatmap", "heatmap"],
    ["transcript", "transcript"],
    ["metadata", "metadata"],
  ];
  return (
    <span className="flex flex-wrap items-center gap-1">
      {items.map(([key, label]) => (
        <span
          key={key}
          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
            signals[key]
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
          }`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

function Badge({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${
        active
          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
          : "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-800 dark:text-zinc-500"
      }`}
    >
      {children}
    </span>
  );
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
