import { NextResponse } from 'next/server';
import { isValidCronRequest } from '@/lib/cron-auth';
import { pollPendingVerifications } from 'src/app/actions/nursys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Invoked every few minutes by pg_cron (pg_net). Advances all in-flight Nursys
// verifications so results finalize even when no browser tab is open.
export async function POST(req: Request) {
  if (!(await isValidCronRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await pollPendingVerifications();
  return NextResponse.json({ ok: true, ...result });
}
