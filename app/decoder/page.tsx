"use client";

import { useState, useEffect } from "react";
import type { AnalysisResult } from "@/lib/analyzer";

function InterestMeter({ level }: { level: number }) {
  const color =
    level >= 7
      ? "bg-green-500"
      : level >= 4
      ? "bg-yellow-500"
      : "bg-red-500";
  const label =
    level >= 7 ? "Alto interés" : level >= 4 ? "Interés moderado" : "Poco interés";

  return (
    <div className="mb-6">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-zinc-400">Nivel de interés real</span>
        <span className="font-black text-white">
          {level}/10 — {label}
        </span>
      </div>
      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-1000`}
          style={{ width: `${level * 10}%` }}
        />
      </div>
    </div>
  );
}

export default function DecoderPage() {
  const [conversation, setConversation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true" || params.get("unlocked") === "true") {
      setUnlocked(true);
    }
  }, []);

  async function handleAnalyze() {
    if (!conversation.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setLimitReached(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation }),
      });

      if (res.status === 402) {
        setLimitReached(true);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error desconocido.");
        return;
      }
      setResult(data.result);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout() {
    const res = await fetch("/api/checkout", { method: "POST" });
    const { url } = await res.json();
    window.location.href = url;
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <a href="/" className="text-zinc-500 text-sm hover:text-zinc-300 mb-6 inline-block">
            ← Inicio
          </a>
          <h1 className="text-3xl md:text-4xl font-black mb-3">
            Decoder de <span className="text-red-500">WhatsApp</span>
          </h1>
          <p className="text-zinc-400">
            Pega la conversación. La IA te dice qué siente realmente.
          </p>
          {unlocked && (
            <div className="mt-4 bg-green-900/40 border border-green-700 text-green-400 rounded-xl px-4 py-3 text-sm font-semibold">
              Acceso ilimitado activado. Analiza cuantas conversaciones quieras.
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <label className="block text-sm text-zinc-400 mb-3">
            Pega aquí la conversación (puedes omitir nombres, pon "Yo" y "El/Ella")
          </label>
          <textarea
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
            placeholder={`Yo: Hola, ¿qué tal tu fin de semana?
El/Ella: Bien, ocupado
Yo: ¿Quedamos esta semana?
El/Ella: Ya veré...`}
            className="w-full h-48 bg-zinc-800 text-white placeholder-zinc-600 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-600 border border-zinc-700"
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-zinc-600 text-xs">
              Mínimo 20 caracteres para analizar
            </span>
            <button
              onClick={handleAnalyze}
              disabled={loading || conversation.trim().length < 20}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-full transition-all"
            >
              {loading ? "Analizando..." : "Analizar →"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Limit reached → upsell */}
        {limitReached && (
          <div className="bg-zinc-900 border border-red-800 rounded-2xl p-8 text-center">
            <p className="text-2xl font-black mb-2">
              Tu análisis gratis ya fue usado
            </p>
            <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
              Desbloquea análisis ilimitados por un único pago de{" "}
              <span className="text-white font-bold">€19</span>. Sin
              suscripción. Para siempre.
            </p>
            <ul className="text-left text-sm text-zinc-300 mb-8 space-y-2 max-w-xs mx-auto">
              {[
                "Análisis ilimitados",
                "Mensaje exacto para responder",
                "Detección de red flags y señales ocultas",
                "Acceso de por vida",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-red-500 font-bold">✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleCheckout}
              className="bg-red-600 hover:bg-red-500 text-white font-bold px-10 py-4 rounded-full transition-all transform hover:scale-105 text-lg w-full"
            >
              Desbloquear por €19 →
            </button>
            <p className="text-zinc-600 text-xs mt-3">
              Pago seguro · Acceso inmediato · Sin sorpresas
            </p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4 animate-in">
            {/* Verdict banner */}
            <div className="bg-red-950/50 border border-red-800 rounded-2xl p-6 text-center">
              <p className="text-xs text-red-400 uppercase tracking-widest mb-2">
                Veredicto
              </p>
              <p className="text-xl font-black">{result.verdict}</p>
            </div>

            {/* Interest meter */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <InterestMeter level={result.interestLevel} />
              <div className="text-sm text-zinc-400">
                <span className="text-white font-semibold">Estado emocional:</span>{" "}
                {result.emotionalState}
              </div>
            </div>

            {/* Hidden signals */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="font-bold mb-4 text-red-400">
                Señales ocultas detectadas
              </h3>
              <ul className="space-y-2">
                {result.hiddenSignals.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-red-500 mt-0.5">•</span> {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* Red flags */}
            {result.redFlags.length > 0 && result.redFlags[0] && (
              <div className="bg-red-950/30 border border-red-900 rounded-2xl p-6">
                <h3 className="font-bold mb-4 text-red-400">Red Flags</h3>
                <ul className="space-y-2">
                  {result.redFlags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-red-500 font-bold mt-0.5">⚠</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendation */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="font-bold mb-3">¿Qué deberías hacer ahora?</h3>
              <p className="text-zinc-300 text-sm leading-relaxed">
                {result.recommendation}
              </p>
            </div>

            {/* Suggested message */}
            <div className="bg-zinc-900 border border-red-900 rounded-2xl p-6">
              <h3 className="font-bold mb-3 text-red-400">
                Mensaje sugerido para enviar
              </h3>
              <div className="bg-zinc-800 rounded-xl p-4 text-sm text-white leading-relaxed italic">
                &quot;{result.suggestedResponse}&quot;
              </div>
            </div>

            {/* Analyze another */}
            <button
              onClick={() => {
                setResult(null);
                setConversation("");
              }}
              className="w-full border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white font-semibold py-3 rounded-xl transition-all text-sm"
            >
              Analizar otra conversación
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
