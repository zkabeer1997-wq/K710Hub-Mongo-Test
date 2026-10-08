-- Adds the intake period field used by the interest submission form and admin filters.
-- Run this in the Supabase SQL editor for the KvK Tracker 710 project.

alter table public.interest_submissions
  add column if not exists intake_period text;
