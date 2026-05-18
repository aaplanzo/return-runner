// Supabase Edge Function: create-payment-intent
//
// Called by the customer checkout screen just before presenting the Stripe
// PaymentSheet. Creates a Stripe PaymentIntent for the full job amount.
//
// POST body:
//   { amount_cents: number, currency?: string, metadata?: Record<string, string> }
//
// Response:
//   { clientSecret: string, paymentIntentId: string }
//
// Environment variables required (set in Supabase Dashboard → Settings → Edge Functions):
//   STRIPE_SECRET_KEY — your Stripe secret key (sk_live_... or sk_test_...)
//
// Payment split:
//   Platform keeps 25% (platform_cut). Runner earns 75% (runner_payout).
//   These are recorded on the jobs row at booking time. When the runner
//   completes the job and their Stripe Connect account is linked, call the
//   Stripe Transfers API to move runner_payout to their connected account.
//   See: https://stripe.com/docs/connect/separate-charges-and-transfers

import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  // @ts-ignore — Stripe types expect Node httpClient; Deno fetch works fine
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: '2024-06-20',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      amount_cents,
      currency = 'usd',
      metadata = {},
    }: { amount_cents: number; currency?: string; metadata?: Record<string, string> } =
      await req.json();

    if (!amount_cents || amount_cents < 50) {
      return new Response(
        JSON.stringify({ error: 'amount_cents must be at least 50 (= $0.50)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount_cents),
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('create-payment-intent error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
