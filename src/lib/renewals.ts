// src/lib/renewals.ts
// Pure, dependency-free logic for computing upcoming credential/document renewals.
// Kept side-effect free so it can be unit-tested and reused by both the in-app
// Renewals view (server action) and a scheduled email-alert job (Edge Function).

import type { ComplianceRule, Facility, FacilityToggleKey } from './types';
import { tokensMatch, calcExpirationDate, ruleAppliesToFacility } from './reg-monitor';

export type RenewalStatus = 'expired' | 'due_soon' | 'upcoming';

/** A single document whose expiration falls inside the lookahead window. */
export interface RenewalItem {
  documentId: string;
  documentName: string;
  documentType: string;
  /** The compliance requirement this document satisfies, when one matches. */
  requirementName: string | null;
  severity: 'critical' | 'standard' | null;
  scoreCategory: 'facility' | 'personnel' | null;
  /** Linked employee, when the document is a personnel credential. */
  personnelId: string | null;
  personnelName: string | null;
  /** ISO date (YYYY-MM-DD) the document expires / must be renewed. */
  expiration: string;
  /** Whole days until expiration. Negative when already expired. */
  daysUntil: number;
  status: RenewalStatus;
}

/** Minimal document shape this module needs (subset of `facility_documents`). */
export interface RenewalDocInput {
  id: string;
  name: string | null;
  document_type: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const DUE_SOON_DAYS = 30;

function statusFor(daysUntil: number): RenewalStatus {
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= DUE_SOON_DAYS) return 'due_soon';
  return 'upcoming';
}

/**
 * Compute the set of documents that are expired or expiring within `windowDays`.
 *
 * Expiration is resolved by the same rules the scoring engine uses:
 *   1. the AI-extracted printed expiration date on the document, else
 *   2. upload date + the renewal frequency of the best-matching requirement.
 * Documents with no resolvable expiration (one-time / ongoing, no printed date)
 * are intentionally skipped — there is nothing to renew.
 */
export function computeRenewals(params: {
  facility: Pick<Facility, 'facility_type' | FacilityToggleKey>;
  rules: ComplianceRule[];
  docs: RenewalDocInput[];
  personnelNameById: Map<string, string>;
  windowDays: number;
  now?: Date;
}): RenewalItem[] {
  const { facility, rules, docs, personnelNameById, windowDays, now = new Date() } = params;

  // Only requirements that actually apply to this facility's type + scope toggles.
  const applicableRules = rules.filter((r) => ruleAppliesToFacility(r, facility));

  const items: RenewalItem[] = [];

  for (const doc of docs) {
    const docType = doc.document_type ?? '';
    const matched = docType
      ? applicableRules.find((r) => tokensMatch(r.required_document_type, docType))
      : undefined;

    const aiExpiration =
      typeof doc.metadata?.ai_extracted_expiration === 'string'
        ? (doc.metadata.ai_extracted_expiration as string)
        : null;

    const expiration = calcExpirationDate(
      doc.created_at,
      matched?.frequency ?? 'ongoing',
      aiExpiration
    );
    if (!expiration) continue; // nothing to renew

    const daysUntil = Math.floor((expiration.getTime() - now.getTime()) / DAY_MS);
    if (daysUntil > windowDays) continue; // not yet relevant

    const personnelId =
      typeof doc.metadata?.personnel_id === 'string'
        ? (doc.metadata.personnel_id as string)
        : null;

    items.push({
      documentId: doc.id,
      documentName: doc.name ?? docType ?? 'Document',
      documentType: docType,
      requirementName: matched?.requirement_name ?? null,
      severity: matched?.severity ?? null,
      scoreCategory: matched?.score_category ?? null,
      personnelId,
      personnelName: personnelId ? personnelNameById.get(personnelId) ?? null : null,
      expiration: expiration.toISOString().split('T')[0],
      daysUntil,
      status: statusFor(daysUntil),
    });
  }

  // Most urgent first (expired, then soonest), criticals break ties.
  return items.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return a.documentName.localeCompare(b.documentName);
  });
}
