import type { IdentifiedGap } from '@/lib/types';

/** Representative gap mix for marketing one-pager score wheels. */
function gap(
  id: string,
  name: string,
  status: IdentifiedGap['compliance_status'],
  category: IdentifiedGap['score_category']
): IdentifiedGap {
  return {
    id,
    name,
    typeKey: id,
    severity: 'standard',
    frequency: 'annual',
    is_scored: true,
    score_category: category,
    compliance_status: status,
  };
}

export const ONE_PAGER_FACILITY_GAPS: IdentifiedGap[] = [
  gap('f1', 'Fire inspection certificate', 'satisfied', 'facility'),
  gap('f2', 'Health department approval', 'satisfied', 'facility'),
  gap('f3', 'Emergency evacuation plan', 'satisfied', 'facility'),
  gap('f4', 'Food service permit', 'expiring_soon', 'facility'),
  gap('f5', 'Transportation vehicle inspection', 'satisfied', 'facility'),
  gap('f6', 'Water safety documentation', 'pending_review', 'facility'),
];

export const ONE_PAGER_PERSONNEL_GAPS: IdentifiedGap[] = [
  gap('p1', 'Director credentials', 'satisfied', 'personnel'),
  gap('p2', 'RN license (Nursys verified)', 'satisfied', 'personnel'),
  gap('p3', 'CPR / First Aid certifications', 'satisfied', 'personnel'),
  gap('p4', 'Background check renewals', 'expiring_soon', 'personnel'),
  gap('p5', 'Annual training records', 'satisfied', 'personnel'),
  gap('p6', 'TB screening documentation', 'missing', 'personnel'),
];

export const ONE_PAGER_FACILITY_SCORE = 78;
export const ONE_PAGER_PERSONNEL_SCORE = 84;
