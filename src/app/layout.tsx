import type { Metadata } from 'next';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: '경희온담한의원 운영 대시보드',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let staffName: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from('staff')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();
    staffName = staff?.name ?? user.email ?? null;
  }

  return (
    <html lang="ko">
      <body>
        {user ? (
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar staffName={staffName} />
            <main style={{ flex: 1, padding: 24 }}>{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
