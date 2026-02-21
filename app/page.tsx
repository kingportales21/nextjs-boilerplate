"use client";

import { useState, useEffect, useCallback } from "react";

type GatewayStatus = {
  status: "online" | "offline" | "error" | "loading";
  gateway?: string;
  message?: string;
  details?: Record<string, unknown>;
};

type SetupStep = {
  number: number;
  title: string;
  description: string;
  command?: string;
  done: boolean;
};

export default function Home() {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({
    status: "loading",
  });
  const [sendTarget, setSendTarget] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/openclaw/status");
      const data = await res.json();
      setGatewayStatus(data);
    } catch {
      setGatewayStatus({ status: "offline" });
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendStatus("sending");
    try {
      const res = await fetch("/api/openclaw/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: sendTarget, message: sendMessage }),
      });
      if (res.ok) {
        setSendStatus("sent");
        setSendMessage("");
        setTimeout(() => setSendStatus(null), 3000);
      } else {
        setSendStatus("error");
      }
    } catch {
      setSendStatus("error");
    }
  };

  const copyCommand = (command: string, stepNumber: number) => {
    navigator.clipboard.writeText(command);
    setCopied(stepNumber);
    setTimeout(() => setCopied(null), 2000);
  };

  const setupSteps: SetupStep[] = [
    {
      number: 1,
      title: "Crear bot en Telegram",
      description:
        'Abre Telegram, busca @BotFather, envia /newbot y sigue las instrucciones. Guarda el token que te da.',
      done: false,
    },
    {
      number: 2,
      title: "Ejecutar script de setup",
      description:
        "Ejecuta el script de configuracion que instalara OpenClaw y configurara todo automaticamente.",
      command: "bash scripts/setup-openclaw.sh",
      done: false,
    },
    {
      number: 3,
      title: "Iniciar el gateway",
      description:
        "Abre una terminal y ejecuta el gateway de OpenClaw para que empiece a escuchar mensajes.",
      command: "openclaw gateway",
      done: gatewayStatus.status === "online",
    },
    {
      number: 4,
      title: "Aprobar tu usuario",
      description:
        "Envia un mensaje a tu bot en Telegram. Luego aprueba tu usuario desde la terminal.",
      command: "openclaw pairing list telegram",
      done: false,
    },
  ];

  const statusColor = {
    online: "bg-green-500",
    offline: "bg-red-500",
    error: "bg-yellow-500",
    loading: "bg-zinc-400",
  };

  const statusLabel = {
    online: "Conectado",
    offline: "Desconectado",
    error: "Error",
    loading: "Comprobando...",
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦞</span>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              OpenClaw + Telegram
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor[gatewayStatus.status]}`}
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Gateway: {statusLabel[gatewayStatus.status]}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Status Card */}
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Estado del Gateway
          </h2>
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                gatewayStatus.status === "online"
                  ? "bg-green-100 dark:bg-green-900/30"
                  : gatewayStatus.status === "loading"
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "bg-red-100 dark:bg-red-900/30"
              }`}
            >
              <span className="text-2xl">
                {gatewayStatus.status === "online"
                  ? "✓"
                  : gatewayStatus.status === "loading"
                    ? "..."
                    : "✗"}
              </span>
            </div>
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {statusLabel[gatewayStatus.status]}
              </p>
              {gatewayStatus.gateway && (
                <p className="font-mono text-sm text-zinc-500">
                  {gatewayStatus.gateway}
                </p>
              )}
              {gatewayStatus.message && (
                <p className="mt-1 text-sm text-zinc-500">
                  {gatewayStatus.message}
                </p>
              )}
            </div>
            <button
              onClick={checkStatus}
              className="ml-auto rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Actualizar
            </button>
          </div>
        </section>

        {/* Setup Guide */}
        <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-6 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Guia de Configuracion
          </h2>
          <div className="space-y-6">
            {setupSteps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    step.done
                      ? "bg-green-500 text-white"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  {step.done ? "✓" : step.number}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {step.description}
                  </p>
                  {step.command && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="rounded-md bg-zinc-100 px-3 py-1.5 font-mono text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {step.command}
                      </code>
                      <button
                        onClick={() => copyCommand(step.command!, step.number)}
                        className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {copied === step.number ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Send Message (only when online) */}
        {gatewayStatus.status === "online" && (
          <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Enviar Mensaje de Prueba
            </h2>
            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Destinatario (ID o @username)
                </label>
                <input
                  type="text"
                  value={sendTarget}
                  onChange={(e) => setSendTarget(e.target.value)}
                  placeholder="@username o 123456789"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Mensaje
                </label>
                <textarea
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  rows={3}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={sendStatus === "sending"}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {sendStatus === "sending" ? "Enviando..." : "Enviar"}
                </button>
                {sendStatus === "sent" && (
                  <span className="text-sm text-green-600">
                    Mensaje enviado correctamente
                  </span>
                )}
                {sendStatus === "error" && (
                  <span className="text-sm text-red-600">
                    Error al enviar el mensaje
                  </span>
                )}
              </div>
            </form>
          </section>
        )}

        {/* Useful Links */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Enlaces Utiles
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href="https://docs.openclaw.ai/channels/telegram"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="text-lg">📖</span>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  Documentacion Telegram
                </p>
                <p className="text-xs text-zinc-500">
                  docs.openclaw.ai
                </p>
              </div>
            </a>
            <a
              href="https://github.com/openclaw/openclaw"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="text-lg">🐙</span>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  GitHub OpenClaw
                </p>
                <p className="text-xs text-zinc-500">
                  github.com/openclaw
                </p>
              </div>
            </a>
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="text-lg">🤖</span>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  BotFather
                </p>
                <p className="text-xs text-zinc-500">
                  Crear tu bot de Telegram
                </p>
              </div>
            </a>
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="text-lg">🔑</span>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  Anthropic Console
                </p>
                <p className="text-xs text-zinc-500">
                  Obtener API key
                </p>
              </div>
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <p className="text-center text-sm text-zinc-500">
            OpenClaw + Telegram Dashboard — Powered by Next.js
          </p>
        </div>
      </footer>
    </div>
  );
}
