/** Public asset paths — work on localhost and after deploy to app.complianceguardpro.io */
export const EMAIL_SIGNATURE_HEADSHOT = '/linkedin-profile-headshot-email.png';
export const EMAIL_SIGNATURE_LOGO = '/logo-shield-linkedin.png';

/** Absolute URLs for pasted email signatures (recipients must fetch these over HTTPS). */
export const EMAIL_SIGNATURE_HEADSHOT_URL =
  'https://app.complianceguardpro.io/linkedin-profile-headshot-email.png';
export const EMAIL_SIGNATURE_LOGO_URL =
  'https://app.complianceguardpro.io/logo-shield-linkedin.png';

export function buildEmailSignatureHtml(imageBase: '' | 'https://app.complianceguardpro.io' = ''): string {
  const headshot = imageBase ? `${imageBase}${EMAIL_SIGNATURE_HEADSHOT}` : EMAIL_SIGNATURE_HEADSHOT;
  const logo = imageBase ? `${imageBase}${EMAIL_SIGNATURE_LOGO}` : EMAIL_SIGNATURE_LOGO;

  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-family: Arial, Helvetica, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.45; color: #1e293b;"><tr><td valign="top" style="padding: 0 16px 0 0; width: 88px;"><img src="${headshot}" alt="Nolan Bevis" width="80" height="80" style="display: block; width: 80px; height: 80px; border-radius: 50%; border: 2px solid #e2e8f0; object-fit: cover;" /></td><td valign="top" style="padding: 0; border-left: 3px solid #1d4ed8; padding-left: 16px;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;"><tr><td style="padding: 0 0 2px 0;"><span style="font-size: 16px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">Nolan Bevis</span></td></tr><tr><td style="padding: 0 0 10px 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;"><tr><td valign="middle" style="padding: 0 6px 0 0;"><img src="${logo}" alt="" width="18" height="18" style="display: block; width: 18px; height: 18px;" /></td><td valign="middle" style="font-size: 13px; font-weight: 600; color: #1d4ed8;">Founder, Compliance Guard Pro</td></tr></table></td></tr><tr><td style="padding: 0 0 3px 0; font-size: 13px; color: #475569;"><a href="mailto:nolan@complianceguardpro.io" style="color: #475569; text-decoration: none;">nolan@complianceguardpro.io</a></td></tr><tr><td style="padding: 0 0 3px 0; font-size: 13px;"><a href="https://app.complianceguardpro.io" style="color: #1d4ed8; text-decoration: none; font-weight: 600;">app.complianceguardpro.io</a></td></tr><tr><td style="padding: 0; font-size: 13px;"><a href="https://linkedin.com/compliance-guard-pro" style="color: #475569; text-decoration: none;">linkedin.com/compliance-guard-pro</a></td></tr></table></td></tr></table>`;
}
