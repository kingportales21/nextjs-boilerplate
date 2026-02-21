import { NextResponse } from "next/server";

export async function GET() {
  const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT || "18789";
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${gatewayUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json({
        status: "online",
        gateway: gatewayUrl,
        details: data,
      });
    }

    return NextResponse.json({
      status: "error",
      gateway: gatewayUrl,
      message: `Gateway responded with status ${response.status}`,
    });
  } catch {
    return NextResponse.json({
      status: "offline",
      gateway: gatewayUrl,
      message:
        "No se puede conectar al gateway de OpenClaw. Asegurate de que esta corriendo: openclaw gateway",
    });
  }
}
