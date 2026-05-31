/**
 * Centralized legal/company constants used across the Terms, Privacy, and
 * Disclaimer pages and footers.
 *
 * ⚠️ ACTION REQUIRED before launch:
 *   1. Have an attorney review src/app/(terms|privacy|disclaimer)/page.tsx.
 *   2. Update LEGAL_LAST_UPDATED whenever the policies change.
 *
 * Changing the values here updates every legal page + footer automatically.
 */

/** Registered legal entity operating the Service. */
export const LEGAL_ENTITY = 'Compliance Guard Pro, LLC';

/** Public product/brand name. */
export const PRODUCT_NAME = 'Compliance Guard Pro';

/** Primary support / legal contact address. */
export const LEGAL_CONTACT_EMAIL = 'nolan@complianceguardpro.io';

/** Governing-law jurisdiction. Default assumption: Arkansas (confirm with counsel). */
export const LEGAL_GOVERNING_STATE = 'Arkansas';

/** Human-readable "last updated" date shown on each policy page. */
export const LEGAL_LAST_UPDATED = 'May 29, 2026';
