import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT || "18789";
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

  try {
    const body = await request.json();
    const { target, message, channel } = body;

    if (!target || !message) {
      return NextResponse.json(
        { error: "Se requieren los campos 'target' y 'message'" },
        { status: 400 }
      );
    }

    const response = await fetch(`${gatewayUrl}/api/message/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: channel || "telegram",
        target,
        message,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json({ status: "sent", details: data });
    }

    return NextResponse.json(
      { error: `Gateway responded with status ${response.status}` },
      { status: response.status }
    );
  } catch {
    return NextResponse.json(
      { error: "No se puede conectar al gateway de OpenClaw" },
      { status: 503 }
    );
  }
}
