import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '경희온담한의원 운영 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
