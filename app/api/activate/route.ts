import { NextResponse } from "next/server";

// Called after successful Stripe payment (redirect from success_url)
export async function GET() {
  const response = NextResponse.redirect(
    new URL("/decoder?unlocked=true", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000")
  );
  response.cookies.set("premium_access", "true", {
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}
