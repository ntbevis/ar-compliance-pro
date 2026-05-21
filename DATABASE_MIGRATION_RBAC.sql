-- =====================================================
-- DATABASE MIGRATION: RBAC & DIRECTOR ASSIGNMENTS
-- =====================================================
-- This migration adds Role-Based Access Control (RBAC) support
-- and director-to-facility assignment tracking.
--
-- Run these SQL commands in your Supabase SQL Editor or migration tool.
-- =====================================================

-- STEP 1: Add 'role' column to user_profiles (or profiles) table
-- This column stores the user's role: 'owner' or 'director'
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'director' CHECK (role IN ('owner', 'director', 'admin'));

-- Add comment to document the role column
COMMENT ON COLUMN profiles.role IS 'User role for RBAC: owner (full access), director (facility-specific), admin (organization admin)';

-- STEP 2: Add 'director_id' column to facilities table
-- This column links a facility to a specific director user
ALTER TABLE facilities 
ADD COLUMN IF NOT EXISTS director_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add comment to document the director_id column
COMMENT ON COLUMN facilities.director_id IS 'UUID of the director user assigned to this facility. NULL means no specific director assigned.';

-- Add index for performance on director_id lookups
CREATE INDEX IF NOT EXISTS idx_facilities_director_id ON facilities(director_id);

-- STEP 3: Add 'full_name' column to profiles table for audit trail attribution
-- This ensures we can always attribute actions to the correct user
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS full_name TEXT;

COMMENT ON COLUMN profiles.full_name IS 'Full name of the user for audit trail attribution and display purposes';

-- STEP 4: Set default role for existing users (optional - adjust as needed)
-- Uncomment the following line to set all existing users to 'owner' role
-- UPDATE profiles SET role = 'owner' WHERE role IS NULL;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify the migration was successful:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('role', 'full_name');
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'facilities' AND column_name = 'director_id';
