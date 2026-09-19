// 데스크에서 자주 쓰는 외부 사이트. 바꿀 때는 여기 목록만 고치면 된다.
// bg/fg는 각 서비스에 어울리는 옅은 배경과 진한 글자색이다.
export interface FavoriteLink {
  label: string;
  url: string;
  emoji: string;
  bg: string;
  fg: string;
}

export const FAVORITE_LINKS: FavoriteLink[] = [
  { label: '핀셋포인트', url: 'https://growth-mate.co.kr/reservations', emoji: '📌', bg: '#fbe4ef', fg: '#b02a6b' },
  { label: '주차', url: 'https://npdc-i.nicepark.co.kr/', emoji: '🅿️', bg: '#e0eefa', fg: '#245d8f' },
  { label: '린다이어트', url: 'https://chart.leandiet.co.kr/patients?status=ongoing', emoji: '🥗', bg: '#ebe3fb', fg: '#6831d7' },
  { label: '혈액검사', url: 'https://prs.precision-bio.com/login', emoji: '🩸', bg: '#fbe4e1', fg: '#b03a2e' },
  { label: '옴니핏', url: 'https://medicms.omnifit.co.kr/', emoji: '🏃', bg: '#fdece0', fg: '#b4560f' },
  { label: '택배', url: 'https://loisparcelp.cjlogistics.com/index.do', emoji: '📦', bg: '#f3e9dc', fg: '#8a5a2b' },
  { label: '플레이스', url: 'https://new.smartplace.naver.com/bizes/booking/748929', emoji: '📍', bg: '#dff5e6', fg: '#1c7a3e' },
  { label: '카카오톡', url: 'https://business.kakao.com/space/667516/channel/_QixblG/chats', emoji: '💬', bg: '#fdf3c4', fg: '#7a5d00' },
  { label: '네이버톡톡', url: 'https://partner.talk.naver.com/web/accounts/100883601/', emoji: '🗨️', bg: '#d9f3df', fg: '#0f7a35' },
  { label: '직원 매뉴얼', url: 'https://app.notion.com/p/105bb1b3a31c8081bbc3ed64c65bb2ed', emoji: '📖', bg: '#ececea', fg: '#37352f' },
];
