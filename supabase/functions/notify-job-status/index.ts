// Supabase Edge Function: notify-job-status
//
// Trigger: Database webhook on jobs table UPDATE events.
// Configure in Supabase Dashboard → Database → Webhooks:
//   Table: jobs, Events: UPDATE, Function: notify-job-status
//
// Sends Expo push notifications to:
//  - Customer: when job status changes to accepted, picked_up, complete
//  - Runner:   when job status changes to complete (tip confirmation)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  record: JobRow;
  old_record: JobRow;
}

interface JobRow {
  id: string;
  customer_id: string;
  runner_id: string | null;
  status: string;
  retailer: string | null;
  package_count: number | null;
  runner_payout: number | null;
  tip_amount: number;
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'high' | 'normal';
}

async function sendPushNotification(messages: PushMessage[]) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  return response.json();
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();
    const { record: job, old_record: oldJob } = payload;

    // Only act on status transitions
    if (job.status === oldJob.status) {
      return new Response('no change', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch push tokens for customer and runner
    const userIds = [job.customer_id, job.runner_id].filter(Boolean) as string[];
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, expo_push_token')
      .in('id', userIds);

    const byId = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
    const customer = byId[job.customer_id];
    const runner = job.runner_id ? byId[job.runner_id] : null;

    const messages: PushMessage[] = [];
    const retailer = job.retailer ?? 'store';
    const pkgLabel = job.package_count === 1 ? '1 package' : `${job.package_count ?? ''} packages`;

    if (job.status === 'accepted' && customer?.expo_push_token) {
      messages.push({
        to: customer.expo_push_token,
        title: 'Runner on the way! 🚗',
        body: `${runner?.first_name ?? 'Your runner'} accepted your return and is heading to pick up your ${pkgLabel}.`,
        data: { jobId: job.id, status: 'accepted' },
        sound: 'default',
        priority: 'high',
      });
    }

    if (job.status === 'picked_up' && customer?.expo_push_token) {
      messages.push({
        to: customer.expo_push_token,
        title: 'Package picked up! 📦',
        body: `Your ${pkgLabel} ${job.package_count === 1 ? 'has' : 'have'} been picked up and ${job.package_count === 1 ? 'is' : 'are'} heading to ${retailer}.`,
        data: { jobId: job.id, status: 'picked_up' },
        sound: 'default',
        priority: 'high',
      });
    }

    if (job.status === 'complete') {
      if (customer?.expo_push_token) {
        messages.push({
          to: customer.expo_push_token,
          title: 'Return complete! ✅',
          body: `Your ${pkgLabel} ${job.package_count === 1 ? 'has' : 'have'} been returned to ${retailer}. Please rate your runner!`,
          data: { jobId: job.id, status: 'complete' },
          sound: 'default',
          priority: 'high',
        });
      }
      if (runner?.expo_push_token) {
        const total = (job.runner_payout ?? 0) + (job.tip_amount ?? 0);
        messages.push({
          to: runner.expo_push_token,
          title: 'Payout incoming! 💸',
          body: `Great work — $${total.toFixed(2)} will transfer to your bank within 2 business days.`,
          data: { jobId: job.id, status: 'complete' },
          sound: 'default',
          priority: 'normal',
        });
      }
    }

    if (messages.length > 0) {
      await sendPushNotification(messages);
    }

    return new Response(JSON.stringify({ sent: messages.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('notify-job-status error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
