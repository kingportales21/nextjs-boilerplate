import Anthropic from "@anthropic-ai/sdk";

export interface AnalysisResult {
  interestLevel: number; // 0-10
  emotionalState: string;
  hiddenSignals: string[];
  redFlags: string[];
  recommendation: string;
  suggestedResponse: string;
  verdict: string;
}

export async function analyzeChat(
  conversation: string
): Promise<AnalysisResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `Eres un experto en psicología de relaciones y análisis de comunicación emocional.
Analiza conversaciones de WhatsApp/texto y devuelve un análisis estructurado en JSON.
Sé directo, sin filtros, como un amigo que te dice la verdad aunque duela.
Responde SIEMPRE en español.
Responde SOLO con JSON válido, sin markdown, sin explicaciones extra.`,
    messages: [
      {
        role: "user",
        content: `Analiza esta conversación y devuelve JSON con exactamente esta estructura:
{
  "interestLevel": <número 0-10 que indica cuánto interés real muestra la otra persona>,
  "emotionalState": "<estado emocional de la otra persona en una frase>",
  "hiddenSignals": ["<señal oculta 1>", "<señal oculta 2>", "<señal oculta 3>"],
  "redFlags": ["<red flag 1 si existe>"],
  "recommendation": "<qué deberías hacer ahora mismo, 2-3 frases directas>",
  "suggestedResponse": "<el mensaje exacto que deberías enviarle ahora>",
  "verdict": "<veredicto final en una frase impactante>"
}

CONVERSACIÓN:
${conversation}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(text) as AnalysisResult;
}
