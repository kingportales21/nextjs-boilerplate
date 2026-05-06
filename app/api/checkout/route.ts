import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "Decoder de WhatsApp — Acceso Ilimitado",
            description:
              "Análisis IA ilimitados. Descubre lo que realmente siente.",
          },
          unit_amount: 1900, // €19
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/decoder?success=true`,
    cancel_url: `${origin}/decoder`,
  });

  return NextResponse.json({ url: session.url });
}
