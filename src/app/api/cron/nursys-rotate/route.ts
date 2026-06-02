import { NextResponse } from 'next/server';
import { isValidCronRequest } from '@/lib/cron-auth';
import { rotateNursysPassword } from 'src/app/actions/nursys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Invoked daily by pg_cron (pg_net). No-ops unless the Nursys password is older
// than the rotation threshold. Pass ?force=1 to rotate immediately (still
// requires the cron secret) — useful for the first run that seeds Vault.
export async function POST(req: Request) {
  if (!(await isValidCronRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const force = new URL(req.url).searchParams.get('force') === '1';
  const result = await rotateNursysPassword({ force });
  return NextResponse.json({ ok: true, ...result });
}
