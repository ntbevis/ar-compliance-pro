# Audit Logs Table Schema

This table provides immutable audit logging for all compliance-related actions to protect against fraud and ensure DHS auditing standards.

## SQL Schema

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'document_upload', 'digital_attestation', 'document_approval', 'document_rejection'
  ip_address TEXT,
  file_hash TEXT, -- SHA-256 hash for uploaded files (null for attestations)
  metadata JSONB DEFAULT '{}', -- Stores additional context: filename, document_type, user_attestation, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for facility lookups
CREATE INDEX idx_audit_logs_facility ON audit_logs(facility_id);

-- Index for user lookups
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

-- Index for action type filtering
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);

-- Index for timestamp-based queries
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view audit logs for their own organization's facilities
CREATE POLICY "Users can view audit logs for their organization"
  ON audit_logs
  FOR SELECT
  USING (
    facility_id IN (
      SELECT f.id FROM facilities f
      INNER JOIN organizations o ON f.org_id = o.id
      INNER JOIN auth.users u ON o.id = (
        SELECT org_id FROM organizations WHERE id = (
          SELECT org_id FROM facilities WHERE id = facility_id LIMIT 1
        )
      )
      WHERE u.id = auth.uid()
    )
  );

-- Policy: System can insert audit logs (no user updates/deletes allowed for immutability)
CREATE POLICY "System can insert audit logs"
  ON audit_logs
  FOR INSERT
  WITH CHECK (true);
```

## Columns

- **id**: UUID primary key
- **facility_id**: Reference to the facility where the action occurred
- **user_id**: Reference to the user who performed the action
- **action_type**: Type of action performed
  - `document_upload`: User uploaded a compliance document
  - `digital_attestation`: User signed a digital attestation
  - `document_approval`: AI/system approved a document
  - `document_rejection`: AI/system flagged a document
- **ip_address**: IP address of the user (for fraud detection)
- **file_hash**: SHA-256 hash of uploaded file (null for attestations)
- **metadata**: JSONB containing:
  - `filename`: Original filename
  - `document_type`: Classified document type
  - `user_attestation`: Boolean indicating if user certified authenticity
  - `attestation_text`: The exact legal text the user agreed to
  - `requirement_id`: ID of the compliance requirement being satisfied
  - `requirement_name`: Name of the requirement
- **created_at**: Immutable timestamp of when the action occurred

## Usage

Audit logs are automatically created by server actions. Users cannot modify or delete audit logs (immutability enforced by RLS policies).

Query audit logs for a facility:

```typescript
const { data: logs } = await supabase
  .from('audit_logs')
  .select('*')
  .eq('facility_id', facilityId)
  .order('created_at', { ascending: false });
```

## Legal Protection

This audit trail provides:
- **Non-repudiation**: SHA-256 file hashes prove document integrity
- **User accountability**: Explicit user attestation recorded
- **Fraud detection**: IP addresses and timestamps for investigation
- **DHS compliance**: Complete audit trail for regulatory inspections
- **Immutability**: No updates or deletes allowed after creation
