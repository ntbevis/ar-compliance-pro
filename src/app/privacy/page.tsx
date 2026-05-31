import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPageShell from '@/components/LegalPageShell';
import { PRODUCT_NAME, LEGAL_ENTITY, LEGAL_CONTACT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: `Privacy Policy · ${PRODUCT_NAME}`,
  description: 'Privacy Policy for Compliance Guard Pro.',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-2">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p>
        This Privacy Policy explains how {LEGAL_ENTITY} (&ldquo;we,&rdquo; &ldquo;us&rdquo;)
        collects, uses, and protects information in connection with {PRODUCT_NAME} (the
        &ldquo;Service&rdquo;). It applies to the facilities and organizations that use the Service
        and to the personal information they provide about their staff.
      </p>

      <H2>Information we collect</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Account information:</strong> name, email address, role, organization, and
          facility details.
        </li>
        <li>
          <strong>Compliance documents:</strong> files you upload (e.g., certificates, permits,
          inspection records) and their extracted metadata such as document type and expiration
          date.
        </li>
        <li>
          <strong>Staff/personnel information:</strong> information you enter about employees for
          compliance tracking, such as name, role, hire date, and credential status.
        </li>
        <li>
          <strong>Sensitive identifiers (where applicable):</strong> to support primary-source
          license verification (e.g., the Nursys&reg; nurse-license registry), the Service may
          collect limited sensitive identifiers such as the last four digits of a Social Security
          number and birth year. Where collected, this information is used only to perform the
          requested verification and is protected with additional safeguards.
        </li>
        <li>
          <strong>Usage and audit data:</strong> log records of actions taken in the Service (such
          as uploads and attestations), including timestamps and IP address, used for security and
          audit-trail purposes.
        </li>
      </ul>

      <H2>How we use information</H2>
      <ul className="list-disc pl-6 space-y-1">
        <li>To provide, secure, and improve the Service.</li>
        <li>To track compliance status, expirations, and readiness for your facilities.</li>
        <li>To perform document processing and, where applicable, credential verification.</li>
        <li>To maintain audit trails and to communicate with you about your account.</li>
      </ul>

      <H2>Service providers</H2>
      <p>
        We use trusted third parties to operate the Service and share information with them only as
        needed to provide it. These currently include or may include: cloud database and storage
        hosting, AI-based document processing, license-verification registries, and payment
        processing. These providers are bound by their own terms and obligations.
      </p>

      <H2>How we protect information</H2>
      <p>
        Documents are stored in a private storage location accessible only through short-lived,
        signed links. Access to your organization&rsquo;s data is restricted to your organization
        through database-level access controls. We apply additional safeguards to sensitive
        identifiers. No method of transmission or storage is completely secure, but we work to
        protect your information using reasonable administrative and technical measures.
      </p>

      <H2>Data retention</H2>
      <p>
        We retain Customer Data for as long as your account is active or as needed to provide the
        Service and meet legal or recordkeeping obligations. Sensitive identifiers used for
        verification are retained only as long as necessary for that purpose.{' '}
        {/* NOTE: confirm concrete retention periods with counsel, especially for SSN fragments. */}
      </p>

      <H2>Your choices</H2>
      <p>
        You may access or request correction or deletion of personal information by contacting us.
        Because the Service is used by organizations about their staff, some requests may need to be
        directed to the organization that controls the relevant data.
      </p>

      <H2>Children&rsquo;s privacy</H2>
      <p>
        The Service is intended for use by facilities and their staff and is not directed to
        children. We do not knowingly collect personal information from children through the
        Service.
      </p>

      <H2>Changes to this policy</H2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be posted here
        with an updated date.
      </p>

      <H2>Contact</H2>
      <p>
        Questions about this policy or our data practices? Contact us at{' '}
        <a className="text-blue-600 hover:text-blue-700" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
          {LEGAL_CONTACT_EMAIL}
        </a>
        . See also our{' '}
        <Link className="text-blue-600 hover:text-blue-700" href="/terms">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link className="text-blue-600 hover:text-blue-700" href="/disclaimer">
          Disclaimer
        </Link>
        .
      </p>
    </LegalPageShell>
  );
}
