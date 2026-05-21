-- =====================================================
-- DATABASE MIGRATION: Facility Scope Toggles + Twin-Score Taxonomy
-- =====================================================
-- This migration adds:
--   1. Boolean "scope toggle" columns to the `facilities` table
--   2. `is_scored` and `score_category` columns to `compliance_criteria`
--   3. (Optional) Drops the legacy `is_personnel_requirement` column once data is migrated
--
-- Run this in the Supabase SQL Editor.
-- =====================================================

-- ---------------------------------------------------------------
-- 1. Add boolean scope toggles to `facilities` (default FALSE)
-- ---------------------------------------------------------------
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS infant_toddler  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transportation  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS food_service    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS water_activities BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pets            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS special_needs   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sick_care       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS school_age      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS night_care      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS private_water   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS memory_care     BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------
-- 2. Update `compliance_criteria` to support the Twin-Score Engine
-- ---------------------------------------------------------------
ALTER TABLE compliance_criteria
  ADD COLUMN IF NOT EXISTS is_scored      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS score_category TEXT
    CHECK (score_category IN ('facility', 'personnel'));

-- Backfill score_category from legacy is_personnel_requirement (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_criteria'
      AND column_name = 'is_personnel_requirement'
  ) THEN
    UPDATE compliance_criteria
    SET score_category = CASE
      WHEN is_personnel_requirement = TRUE THEN 'personnel'
      ELSE 'facility'
    END
    WHERE score_category IS NULL;
  END IF;
END $$;

-- Optional once you have verified the data:
-- ALTER TABLE compliance_criteria DROP COLUMN IF EXISTS is_personnel_requirement;

-- ---------------------------------------------------------------
-- 3. Update `facility_type` constraint (if previously 'childcare')
-- ---------------------------------------------------------------
-- Normalize legacy 'childcare' value to 'childcare_center'
UPDATE facilities         SET facility_type = 'childcare_center' WHERE facility_type = 'childcare';
UPDATE compliance_criteria SET facility_type = 'childcare_center' WHERE facility_type = 'childcare';
UPDATE regulatory_roles   SET facility_type = 'childcare_center' WHERE facility_type = 'childcare';

-- ---------------------------------------------------------------
-- 4. Helpful indexes
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_compliance_criteria_facility_type  ON compliance_criteria(facility_type);
CREATE INDEX IF NOT EXISTS idx_compliance_criteria_score_category ON compliance_criteria(score_category);
CREATE INDEX IF NOT EXISTS idx_compliance_criteria_is_scored      ON compliance_criteria(is_scored);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_name = 'facilities' AND column_name IN (
--   'infant_toddler','transportation','food_service','water_activities','pets',
--   'special_needs','sick_care','school_age','night_care','private_water','memory_care'
-- );
--
-- SELECT facility_type, score_category, COUNT(*) FROM compliance_criteria
-- GROUP BY facility_type, score_category ORDER BY 1,2;
