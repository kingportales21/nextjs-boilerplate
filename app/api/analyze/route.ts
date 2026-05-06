import { NextRequest, NextResponse } from "next/server";
import { analyzeChat } from "@/lib/analyzer";
import { cookies } from "next/headers";

const FREE_ANALYSES_ALLOWED = 1;

export async function POST(req: NextRequest) {
  const { conversation } = await req.json();

  if (!conversation || conversation.trim().length < 20) {
    return NextResponse.json(
      { error: "Pega al menos una conversación real." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const usedCount = parseInt(cookieStore.get("analyses_used")?.value ?? "0");
  const isPremium = cookieStore.get("premium_access")?.value === "true";

  if (!isPremium && usedCount >= FREE_ANALYSES_ALLOWED) {
    return NextResponse.json({ error: "LIMIT_REACHED" }, { status: 402 });
  }

  try {
    const result = await analyzeChat(conversation);

    const response = NextResponse.json({ result });
    if (!isPremium) {
      response.cookies.set("analyses_used", String(usedCount + 1), {
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: true,
        sameSite: "lax",
      });
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: "Error al analizar. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
