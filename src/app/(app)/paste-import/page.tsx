import { PasteImportWidget } from '@/components/PasteImportWidget';

export default function PasteImportPage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>일일결산</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        매일 마감할 때 OK차트의 일일 결산표를 복사해 맨 위 칸에 붙여넣으세요. 예약 명단과 월말 결산표도
        이 화면에서 같은 방식으로 입력해요.
      </p>
      <PasteImportWidget />
    </div>
  );
}
