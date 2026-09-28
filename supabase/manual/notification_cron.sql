-- One-time setup, NOT a migration (it contains a secret): run this by hand in
-- the Supabase SQL editor after the app has CRON_SECRET set in Vercel.
--
-- Wakes the notification scheduler every 5 minutes by calling the app's tick
-- endpoint. It works on any Vercel plan (Vercel's own cron is limited to once a
-- day on the free plan). Replace the two placeholders before running.
--   <YOUR_DEPLOYED_URL>  e.g. https://project-n43cv.vercel.app
--   <YOUR_CRON_SECRET>   the same value as the CRON_SECRET env var in Vercel
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'notifications-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := '<YOUR_DEPLOYED_URL>/api/cron/notifications-tick',
    headers := jsonb_build_object('Authorization', 'Bearer <YOUR_CRON_SECRET>'),
    timeout_milliseconds := 30000
  );
  $$
);

-- To stop it:  select cron.unschedule('notifications-tick');
