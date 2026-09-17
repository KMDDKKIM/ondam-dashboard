import { NavCard } from '@/components/NavCard';

const CARDS: { href: string; label: string; external?: boolean }[] = [
  { href: 'https://kh-ondam-reservation.vercel.app', label: '예약관리', external: true },
  {
    href: 'https://scratch-2026-09-09-c5228e.vercel.app',
    label: '한약 복용법 출력',
    external: true,
  },
  { href: '/happy-call-register', label: '초진환자 해피콜' },
  { href: '/treatment-timer', label: '치료실 타이머' },
  { href: '/happy-call-list', label: '해피콜 목록' },
  { href: '/non-covered-patients', label: '비급여 환자 목록' },
  { href: '/event-patients', label: '이벤트 환자 목록' },
  { href: '/remote-consult-alerts', label: '비대면진료 알람' },
  { href: '/supply-requests', label: '물품신청' },
];

export default function HomePage() {
  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>경희온담한의원 운영 대시보드</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {CARDS.map((card) => (
          <NavCard key={card.href} href={card.href} label={card.label} external={card.external} />
        ))}
      </div>
    </div>
  );
}
