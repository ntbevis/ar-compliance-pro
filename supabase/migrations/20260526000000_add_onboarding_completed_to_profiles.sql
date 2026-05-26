-- Add onboarding_completed flag to profiles table.
-- Defaults to false; set to true once an operator has successfully
-- completed the facility-setup wizard via saveOnboardingData().
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- Back-fill existing users who already have facilities (migration-safe rollout).
-- Any profile whose org already has at least one active facility is considered
-- to have completed onboarding.
UPDATE profiles p
SET onboarding_completed = true
WHERE p.org_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM facilities f
    WHERE f.org_id = p.org_id
    LIMIT 1
  );
