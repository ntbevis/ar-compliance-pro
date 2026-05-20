# Facilities Table Schema Update

## Active Enrollment Column

Add the `active_enrollment` column to track real-time attendance/enrollment for dynamic staffing ratio calculations.

### SQL Migration

```sql
-- Add active_enrollment column to facilities table
ALTER TABLE facilities 
ADD COLUMN IF NOT EXISTS active_enrollment INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN facilities.active_enrollment IS 'Current number of enrolled children/residents. Used for dynamic staffing ratio calculations. Falls back to capacity if null.';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_facilities_active_enrollment ON facilities(active_enrollment);
```

### Column Details

- **active_enrollment**: INTEGER (nullable)
- **Purpose**: Tracks current enrollment/attendance count
- **Usage**: 
  - Used by `getRegulatoryStatus()` for staffing ratio calculations
  - Falls back to `capacity` if null or 0
  - Updated via `updateEnrollment()` server action
- **Default**: NULL (uses capacity as fallback)

### Example Usage

```typescript
// Update enrollment
await updateEnrollment(facilityId, 45);

// Staffing calculation logic
const enrollmentCount = facility.active_enrollment && facility.active_enrollment > 0
  ? facility.active_enrollment
  : facility.capacity;
```

### Benefits

✅ **Real-time accuracy**: Reflects actual attendance vs. licensed capacity  
✅ **Dynamic staffing**: Calculates required staff based on current enrollment  
✅ **Compliance precision**: Prevents over-staffing alerts when enrollment is low  
✅ **User control**: Facilities can update their current count as needed  
