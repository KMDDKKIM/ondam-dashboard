import { NavCard } from '@/components/NavCard';
import { QuoteBanner } from '@/components/QuoteBanner';
import { TodoChecklist } from '@/components/TodoChecklist';
import { TodayHappyCalls } from '@/components/TodayHappyCalls';
import { MonthlyStatsPanel } from '@/components/MonthlyStatsPanel';
import { createClient } from '@/lib/supabase/server';
import { getMonthlySummary } from '@/lib/monthlySummary';

// 예약관리(kh-ondam-reservation)는 이제 자체 비밀번호 게이트가 없어서 그냥
// 링크만 걸면 된다.
const RESERVATION_URL = 'https://kh-ondam-reservation.vercel.app';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from('staff').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const isOwner = staff?.role === 'owner';

  let summary;
  let summaryError = '';
  try {
    summary = await getMonthlySummary();
  } catch {
    summaryError = '이번달 현황을 불러오지 못했습니다.';
  }

  const cards: {
    href: string;
    label: string;
    sublabel: string;
    icon: string;
    accent: string;
    external?: boolean;
  }[] = [
    {
      href: RESERVATION_URL,
      label: '예약관리',
      sublabel: '오늘 예약·마감 멘트',
      icon: '📅',
      accent: '#dff3f1',
      external: true,
    },
    {
      href: 'https://scratch-2026-09-09-c5228e.vercel.app',
      label: '한약 복용법 출력',
      sublabel: '복용 안내문 인쇄',
      icon: '💊',
      accent: '#ece7fa',
      external: true,
    },
    {
      href: '/paste-import',
      label: '엑셀 붙여넣기',
      sublabel: '예약·결산 자동 등록',
      icon: '📥',
      accent: '#e0eefa',
    },
    {
      href: '/happy-call-register',
      label: '초진환자 해피콜',
      sublabel: '입력·재진율 통계',
      icon: '📞',
      accent: '#e3edfa',
    },
    {
      href: '/consult-summary',
      label: '상담 녹음 차팅',
      sublabel: '녹음 붙여넣기 → AI 요약',
      icon: '🩺',
      accent: '#ece7fa',
    },
    {
      href: '/herb-inventory',
      label: '한약재 재고 현황',
      sublabel: '재고 확인·사용·입고',
      icon: '🌿',
      accent: '#e6f3e4',
    },
    {
      href: '/treatment-timer',
      label: '치료실 타이머',
      sublabel: '베드별 치료 시간 관리',
      icon: '⏱️',
      accent: '#fdece0',
    },
    {
      href: '/happy-call-list',
      label: '해피콜 목록',
      sublabel: '오늘 전화할 환자',
      icon: '📋',
      accent: '#e6f3e4',
    },
    {
      href: '/non-covered-patients',
      label: '비급여 현황',
      sublabel: '구분별 구매·이벤트 실적',
      icon: '💰',
      accent: '#faf1de',
    },
    {
      href: '/event-patients',
      label: '이벤트 환자 목록',
      sublabel: '준비 중',
      icon: '🎁',
      accent: '#dcf3f4',
    },
    {
      href: '/remote-consult-alerts',
      label: '비대면진료 알람',
      sublabel: '준비 중',
      icon: '🔔',
      accent: '#e0eefa',
    },
    {
      href: '/supply-requests',
      label: '물품신청',
      sublabel: '준비 중',
      icon: '📦',
      accent: '#ece7fa',
    },
  ];

  if (isOwner) {
    cards.push({
      href: '/staff-approval',
      label: '직원 승인',
      sublabel: '가입 신청 확인',
      icon: '🙋',
      accent: '#e0eefa',
    });
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <p className="muted-text" style={{ marginBottom: 4, fontWeight: 600 }}>
            경희온담한의원
          </p>
          <h1 style={{ fontSize: 30, lineHeight: 1.1, marginBottom: 8 }}>
            <span
              style={{
                background: 'linear-gradient(135deg, var(--color-brand-a), var(--color-brand-b))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              운영
            </span>{' '}
            대시보드
          </h1>
          <p className="muted-text">예약관리·한약 복용법 출력 등 기존 도구와 새 기능을 한 곳에서.</p>
        </div>
        <a
          href={RESERVATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          🔗 예약관리 바로가기
        </a>
      </div>

      <QuoteBanner />

      {summary ? (
        <MonthlyStatsPanel initial={summary} isOwner={isOwner} />
      ) : (
        <p className="error-text" style={{ marginBottom: 20 }}>
          {summaryError}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>⚡ 빠른 접근</span>
        <span className="muted-text">자주 쓰는 도구 모음</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {cards.map((card) => (
          <NavCard key={card.href} {...card} />
        ))}
      </div>

      <TodayHappyCalls />
      <TodoChecklist />
    </div>
  );
}
