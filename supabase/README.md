# Supabase migrations & data quality

## Migration order (production)

Apply in timestamp order via **Supabase Dashboard → SQL Editor** (postgres role) or `supabase db push`:

| File | Purpose |
|------|---------|
| `20260526000000_add_onboarding_completed_to_profiles.sql` | Profiles onboarding flag (if not already applied) |
| `20260528000000_refine_regulatory_roles_and_criteria.sql` | Arkansas roles + `compliance_criteria` role mappings (`text[]`) |
| `20260528200000_audit_fix_role_criteria_scoping.sql` | License/therapy/driver scoping fixes (includes LPN/RN split) |

All scripts are **idempotent** — safe to re-run.

### Already ran an older `20260528000000` in SQL Editor?

Run only `20260528200000_audit_fix_role_criteria_scoping.sql` (it includes nurse license corrections).

## Post-deploy verification

1. **Orphan roles** (expect 0 rows):

```sql
WITH role_names AS (
  SELECT role_name, facility_type FROM regulatory_roles
),
criteria AS (
  SELECT id, requirement_name, facility_type,
         unnest(COALESCE(applicable_roles, ARRAY[]::text[])) AS ref_role
  FROM compliance_criteria
  WHERE applicable_roles IS NOT NULL AND cardinality(applicable_roles) > 0
)
SELECT c.id, c.requirement_name, c.facility_type, c.ref_role
FROM criteria c
LEFT JOIN role_names r ON r.role_name = c.ref_role AND r.facility_type = c.facility_type
WHERE r.role_name IS NULL;
```

2. **Full mapping audit** — run every query in `scripts/audit_role_criteria_mapping.sql` (each should return 0 rows).

## App behavior (Personnel Vault)

- `getRequirementsForRole` uses `applicable_roles` (`text[]`) with exact `regulatory_roles.role_name` matching.
- Requirements refetch when an employee row is expanded (no stale client cache).
- `sub_classification` tags `all_staff`, `facility_management`, and `education` apply without a facility toggle.

## Do not re-run Gemini ingest on `compliance_criteria`

Manual migrations are the source of truth for role mappings. Re-ingesting from PDFs without review will reintroduce phantom role names.
