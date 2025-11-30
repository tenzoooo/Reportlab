-- Update default value for credits column
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 200;

-- Update handle_new_user function to ensure it uses the new default (or explicitly sets it if needed, but default is cleaner)
-- Actually, the previous trigger didn't explicitly set credits, so it relied on default.
-- We just need to ensure the default is updated.

-- Optional: Update existing users with 0 credits to 200 (if desired, but user said "initial value")
-- Uncomment the line below if you want to backfill existing users
-- UPDATE public.profiles SET credits = 200 WHERE credits = 0;
