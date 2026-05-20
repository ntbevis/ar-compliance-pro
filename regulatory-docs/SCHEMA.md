# Database Schema Documentation

## regulatory_roles Table

This table stores AI-discovered personnel roles extracted from regulatory text.

### SQL Schema

```sql
CREATE TABLE regulatory_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL,
  facility_type TEXT NOT NULL,
  sub_classification TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique combinations of role + facility type + sub-classification
  CONSTRAINT unique_role_per_classification UNIQUE (role_name, facility_type, sub_classification)
);

-- Index for fast lookups by facility type
CREATE INDEX idx_regulatory_roles_facility_type ON regulatory_roles(facility_type);

-- Index for sub-classification queries
CREATE INDEX idx_regulatory_roles_sub_classification ON regulatory_roles(sub_classification);

-- Composite index for the most common query pattern
CREATE INDEX idx_regulatory_roles_lookup ON regulatory_roles(facility_type, sub_classification);
```

### Columns

- **id**: UUID primary key
- **role_name**: Official personnel title (e.g., "Director of Nursing", "Primary Caregiver")
- **facility_type**: Either "childcare" or "nursing_home"
- **sub_classification**: Specific facility sub-type (e.g., "CCC", "FCCH", "SNF", "Assisted Living") or NULL for general roles
- **created_at**: Timestamp when role was first discovered
- **updated_at**: Timestamp of last update

### Usage

Run the discovery script to populate this table:

```bash
npm run discover:roles
```

Query roles for a specific facility:

```typescript
const { data: roles } = await supabase
  .from('regulatory_roles')
  .select('role_name')
  .eq('facility_type', facilityType)
  .eq('sub_classification', subClassification);
```
