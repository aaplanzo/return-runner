-- Return Runner — Initial Schema Migration
-- Run this against your Supabase project via the SQL editor or Supabase CLI.

-- ─────────────────────────────────────────
-- Custom enum types
-- ─────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('customer', 'runner', 'admin');
CREATE TYPE job_status AS ENUM ('pending', 'accepted', 'picked_up', 'dropped_off', 'complete', 'cancelled');

-- ─────────────────────────────────────────
-- TABLE: users
-- ─────────────────────────────────────────
CREATE TABLE public.users (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                user_role NOT NULL DEFAULT 'customer',
  first_name          text,
  last_name           text,
  email               text UNIQUE,
  phone               text,
  pickup_address      text,
  pickup_lat          float8,
  pickup_lng          float8,
  stripe_customer_id  text,
  stripe_account_id   text,
  amazon_connected    boolean NOT NULL DEFAULT false,
  walmart_connected   boolean NOT NULL DEFAULT false,
  target_connected    boolean NOT NULL DEFAULT false,
  rating_avg          float4 NOT NULL DEFAULT 5.0,
  rating_count        int    NOT NULL DEFAULT 0,
  is_verified         boolean NOT NULL DEFAULT false,
  is_online           boolean NOT NULL DEFAULT false,
  current_lat         float8,
  current_lng         float8,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- TABLE: jobs
-- ─────────────────────────────────────────
CREATE TABLE public.jobs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               uuid NOT NULL REFERENCES public.users(id),
  runner_id                 uuid REFERENCES public.users(id),
  status                    job_status NOT NULL DEFAULT 'pending',
  retailer                  text,
  package_count             int,
  dropoff_type              text,
  pickup_address            text,
  pickup_lat                float8,
  pickup_lng                float8,
  dropoff_name              text,
  dropoff_lat               float8,
  dropoff_lng               float8,
  distance_miles            float4,
  base_fare                 float4,
  platform_cut              float4,
  runner_payout             float4,
  tip_amount                float4 NOT NULL DEFAULT 0,
  stripe_payment_intent_id  text,
  accepted_at               timestamptz,
  picked_up_at              timestamptz,
  dropped_off_at            timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- TABLE: packages
-- ─────────────────────────────────────────
CREATE TABLE public.packages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  item_name           text,
  item_description    text,
  qr_code_data        text,
  qr_image_path       text,
  item_photo_path     text,
  receipt_photo_path  text,
  dropoff_type        text,
  sort_order          int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- TABLE: ratings
-- ─────────────────────────────────────────
CREATE TABLE public.ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id),
  rater_id    uuid NOT NULL REFERENCES public.users(id),
  ratee_id    uuid NOT NULL REFERENCES public.users(id),
  stars       int NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- TABLE: runner_locations
-- ─────────────────────────────────────────
CREATE TABLE public.runner_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lat         float8 NOT NULL,
  lng         float8 NOT NULL,
  heading     float4,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- TABLE: job_declines
-- ─────────────────────────────────────────
CREATE TABLE public.job_declines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  runner_id   uuid NOT NULL REFERENCES public.users(id),
  declined_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────
ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runner_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_declines   ENABLE ROW LEVEL SECURITY;

-- users: anyone can read their own row; service role can insert on signup
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- jobs: customers see their own jobs; runners see pending + their accepted jobs
CREATE POLICY "jobs_customer_select" ON public.jobs
  FOR SELECT USING (
    auth.uid() = customer_id
    OR auth.uid() = runner_id
    OR status = 'pending'
  );

CREATE POLICY "jobs_customer_insert" ON public.jobs
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "jobs_update_participants" ON public.jobs
  FOR UPDATE USING (
    auth.uid() = customer_id OR auth.uid() = runner_id
  );

-- packages: visible to job participants
CREATE POLICY "packages_select_participants" ON public.packages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND (j.customer_id = auth.uid() OR j.runner_id = auth.uid())
    )
  );

CREATE POLICY "packages_insert_customer" ON public.packages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.customer_id = auth.uid()
    )
  );

-- ratings: visible to participants
CREATE POLICY "ratings_select" ON public.ratings
  FOR SELECT USING (auth.uid() = rater_id OR auth.uid() = ratee_id);

CREATE POLICY "ratings_insert" ON public.ratings
  FOR INSERT WITH CHECK (auth.uid() = rater_id);

-- runner_locations: runner manages own; anyone can read (for map display)
CREATE POLICY "runner_locations_select" ON public.runner_locations
  FOR SELECT USING (true);

CREATE POLICY "runner_locations_upsert" ON public.runner_locations
  FOR ALL USING (auth.uid() = runner_id)
  WITH CHECK (auth.uid() = runner_id);

-- job_declines: runner inserts own declines
CREATE POLICY "job_declines_insert" ON public.job_declines
  FOR INSERT WITH CHECK (auth.uid() = runner_id);

CREATE POLICY "job_declines_select" ON public.job_declines
  FOR SELECT USING (auth.uid() = runner_id);

-- ─────────────────────────────────────────
-- Trigger: auto-insert public.users on auth signup
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
