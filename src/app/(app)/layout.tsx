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

  let staffName: string | null = null;
  const { data: staff } = await supabase
    .from('staff')
    .select('name')
    .eq('id', user.id)
    .maybeSingle();
  staffName = staff?.name ?? user.email ?? null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar staffName={staffName} />
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
