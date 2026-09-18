import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

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
  const isOwner = staff?.role === 'owner';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar staffName={staffName} isOwner={isOwner} />
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
