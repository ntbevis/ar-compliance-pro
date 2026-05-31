import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPageShell from '@/components/LegalPageShell';
import {
  PRODUCT_NAME,
  LEGAL_ENTITY,
  LEGAL_CONTACT_EMAIL,
  LEGAL_GOVERNING_STATE,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: `Terms of Service · ${PRODUCT_NAME}`,
  description: 'Terms of Service for Compliance Guard Pro.',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-2">{children}</h2>;
}

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of{' '}
        {PRODUCT_NAME} (the &ldquo;Service&rdquo;), provided by {LEGAL_ENTITY}
        (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating an account or using
        the Service, you agree to these Terms on behalf of yourself and the facility or organization
        you represent.
      </p>

      <H2>1. Eligibility and accounts</H2>
      <p>
        You must be authorized to act on behalf of your organization to create an account. You are
        responsible for safeguarding your credentials and for all activity under your account. You
        agree to provide accurate information and to keep it current.
      </p>

      <H2>2. The Service is an organizational tool, not advice</H2>
      <p>
        The Service helps you organize and monitor compliance-related documentation. It does not
        provide legal, regulatory, or professional advice, and it does not guarantee compliance or
        any audit, inspection, or licensing outcome. See our{' '}
        <Link className="text-blue-600 hover:text-blue-700" href="/disclaimer">
          Disclaimer
        </Link>{' '}
        for important limitations. You remain solely responsible for your facility&rsquo;s
        compliance.
      </p>

      <H2>3. Your data and content</H2>
      <p>
        You retain ownership of the documents, records, and information you upload (&ldquo;Customer
        Data&rdquo;). You grant us a limited license to host, process, and display Customer Data
        solely to provide and improve the Service. You represent that you have the right to upload
        Customer Data and to share any personal information of your staff for compliance-tracking
        purposes. Our handling of personal information is described in our{' '}
        <Link className="text-blue-600 hover:text-blue-700" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>

      <H2>4. Acceptable use</H2>
      <p>
        You agree not to misuse the Service, including by attempting to access data belonging to
        other organizations, reverse-engineering the Service, uploading malicious content, or using
        the Service to violate any law. We may suspend or terminate accounts that violate these
        Terms.
      </p>

      <H2>5. Third-party services</H2>
      <p>
        The Service relies on third-party providers (for example, cloud hosting, document
        processing, and, where applicable, license-verification and payment providers). Your use of
        the Service may be subject to those providers&rsquo; terms, and we are not responsible for
        their acts or omissions.
      </p>

      <H2>6. Fees</H2>
      <p>
        Paid plans, if applicable, are billed as described at the time of purchase. Unless required
        by law, fees are non-refundable. We may change pricing on prospective notice.
      </p>

      <H2>7. Disclaimers and limitation of liability</H2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
        warranties of any kind, to the maximum extent permitted by law. To the maximum extent
        permitted by law, {LEGAL_ENTITY} will not be liable for any indirect, incidental, special,
        consequential, or punitive damages, or for any regulatory penalties, fines, or losses
        arising from your reliance on the Service. {/* NOTE: liability caps and indemnification
        terms must be set by your attorney. */}
      </p>

      <H2>8. Indemnification</H2>
      <p>
        You agree to indemnify and hold harmless {LEGAL_ENTITY} from claims arising out of your
        Customer Data, your use of the Service, or your violation of these Terms, to the extent
        permitted by law.
      </p>

      <H2>9. Termination</H2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate access for violation
        of these Terms or as needed to protect the Service or its users.
      </p>

      <H2>10. Governing law</H2>
      <p>
        These Terms are governed by the laws of the State of {LEGAL_GOVERNING_STATE}, without regard
        to its conflict-of-laws rules.
      </p>

      <H2>11. Changes to these Terms</H2>
      <p>
        We may update these Terms from time to time. Material changes will be posted here with an
        updated date, and continued use of the Service constitutes acceptance.
      </p>

      <H2>12. Contact</H2>
      <p>
        Questions about these Terms? Contact us at{' '}
        <a className="text-blue-600 hover:text-blue-700" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalPageShell>
  );
}
