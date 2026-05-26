import { redirect } from 'next/navigation';
import { createClient } from 'src/app/utils/supabase/server';

/**
 * Server-side layout guard for all /admin routes.
 * Enforces role === 'admin' before any page content renders.
 * Non-admin users are redirected silently to avoid leaking page existence.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/dashboard');

  return <>{children}</>;
}
