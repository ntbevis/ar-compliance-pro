# Production deployment checklist

Use this before/after deploying **Compliance Guard Pro** (`ar-compliance-pro`).

## 1. Database (Supabase)

- [ ] Run migrations in order — see [supabase/README.md](./supabase/README.md)
- [ ] Run orphan-role verification (0 rows)
- [ ] Run [supabase/scripts/audit_role_criteria_mapping.sql](./supabase/scripts/audit_role_criteria_mapping.sql) (0 rows per check)
- [ ] Confirm `compliance_criteria.applicable_roles` column type is **`text[]`** (not `jsonb`)
- [ ] Confirm FK covering indexes exist (`idx_facilities_org_id`, `idx_facility_documents_facility_id`, `idx_personnel_facility_id`, `idx_profiles_org_id`)
- [ ] Re-run Supabase **security** + **performance** advisors; resolve any new findings

## 2. Environment variables (hosting provider)

Required for the Next.js app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to client)
- OpenAI key(s) used by document verification (see `.env.local` / project config)

## 3. Application deploy

```bash
cd app/ar-compliance-pro
npm ci
npm run lint
npm run build
```

Deploy the build output (e.g. Vercel). No schema changes are required in the app layer beyond Supabase migrations.

## 4. Smoke test (production)

- [ ] Log in with test org; open a **childcare** and **nursing home** facility
- [ ] Personnel Vault: add employee with role from dropdown; expand row — requirements list loads
- [ ] **RN** does **not** show LPN Board Verification; **LPN** does not show RN Board Verification
- [ ] **Infant/Toddler Caregiver** does **not** show New Director Orientation (QRIS); **Center Director** does
- [ ] Infant/Toddler Caregiver **does** show 8-Hour Basic Orientation and background checks
- [ ] **SLP** shows Therapy Board; does **not** show nurse license rules
- [ ] Dashboard facility/personnel scores still load
- [ ] Optional: enable facility toggles (transportation, memory_care) and confirm scoped rules appear

## 5. Session changes in this release

| Area | Change |
|------|--------|
| Data | `regulatory_roles` + `compliance_criteria` Arkansas mappings |
| API | `getRequirementsForRole` — `text[]` roles, `all_staff` baseline, `noStore()` |
| UI | Personnel Vault refetches requirements on expand; auto-expand new hire |
