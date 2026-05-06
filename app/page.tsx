import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/30 to-black pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <p className="text-red-400 text-sm font-semibold uppercase tracking-widest mb-4">
            Tecnología IA · Análisis en 30 segundos
          </p>
          <h1 className="text-4xl md:text-6xl font-black leading-tight mb-6">
            ¿Qué siente{" "}
            <span className="text-red-500">realmente</span>{" "}
            cuando te escribe?
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Pega la conversación. La IA analiza cada palabra, cada punto
            suspensivo, cada hora de respuesta. Te dice la verdad que nadie más
            te dirá.
          </p>
          <Link
            href="/decoder"
            className="inline-block bg-red-600 hover:bg-red-500 text-white text-lg font-bold px-10 py-4 rounded-full transition-all transform hover:scale-105 shadow-lg shadow-red-900/50"
          >
            Analizar conversación ahora →
          </Link>
          <p className="text-zinc-500 text-sm mt-4">
            1 análisis gratis · Sin registro · Resultado en segundos
          </p>
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y border-zinc-800 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 text-center">
          {[
            { n: "47,000+", label: "conversaciones analizadas" },
            { n: "94%", label: "de usuarios dicen que fue exacto" },
            { n: "30 seg", label: "para obtener tu análisis" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-black text-red-500">{s.n}</div>
              <div className="text-zinc-400 text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">
            Cómo funciona
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Pega la conversación",
                desc: "Copia y pega los mensajes de WhatsApp, Instagram o cualquier chat. Sin instalar nada.",
              },
              {
                step: "02",
                title: "La IA lo analiza",
                desc: "Nuestro modelo detecta patrones emocionales, señales ocultas y el estado real de la otra persona.",
              },
              {
                step: "03",
                title: "Recibes la verdad",
                desc: "Nivel de interés, red flags, qué siente y exactamente qué mensaje enviarle ahora.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"
              >
                <div className="text-red-500 font-black text-4xl mb-3">
                  {item.step}
                </div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 px-6 bg-zinc-950">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">
            Lo que dicen los que ya lo usaron
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                name: "Valentina R., 28",
                text: "Llevaba 3 semanas sin entender por qué me respondía raro. El decoder me dijo en 30 segundos que estaba en modo evitativo y me dio el mensaje exacto. Lo mandé. Quedamos.",
              },
              {
                name: "Carlos M., 31",
                text: "Pensé que mi ex me odiaba. El análisis detectó que seguía enganchada pero tenía miedo. Cambié de estrategia completamente. Dos semanas después volvimos.",
              },
              {
                name: "Sofía L., 25",
                text: "Me señaló 3 red flags que yo no quería ver. Fue brutal pero necesario. Me ahorré meses de sufrimiento.",
              },
              {
                name: "Andrés P., 34",
                text: "El mensaje sugerido parecía demasiado simple. Lo mandé igual. Respuesta en 4 minutos cuando llevaba 2 días en visto. Esto funciona.",
              },
            ].map((t) => (
              <div
                key={t.name}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"
              >
                <p className="text-zinc-300 text-sm leading-relaxed mb-4">
                  &quot;{t.text}&quot;
                </p>
                <p className="text-red-400 font-semibold text-sm">{t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            Deja de adivinar.{" "}
            <span className="text-red-500">Empieza a saber.</span>
          </h2>
          <p className="text-zinc-400 mb-8">
            Tu primer análisis es completamente gratis. Sin tarjeta. Sin
            registro.
          </p>
          <Link
            href="/decoder"
            className="inline-block bg-red-600 hover:bg-red-500 text-white text-lg font-bold px-10 py-4 rounded-full transition-all transform hover:scale-105 shadow-lg shadow-red-900/50"
          >
            Analizar ahora — Es gratis →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-6 text-center">
        <p className="text-zinc-600 text-xs">
          © 2026 Decoder IA · Solo para uso informativo · No somos
          psicólogos, somos tecnología.
        </p>
      </footer>
    </main>
  );
}
