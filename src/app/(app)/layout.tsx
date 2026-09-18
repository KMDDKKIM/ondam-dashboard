import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('name, role')
    .eq('id', user.id)
    .maybeSingle();
  const staffName = staff?.name ?? user.email ?? null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <TopBar staffName={staffName} />
      <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>{children}</main>
    </div>
  );
}
