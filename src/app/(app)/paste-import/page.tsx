import { PasteImportWidget } from '@/components/PasteImportWidget';

export default function PasteImportPage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>엑셀 붙여넣기</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        OK차트의 예약목록 / 일일 결산표 / 월말 결산표를 엑셀에서 그대로 복사해 아래에 붙여넣으면 자동으로
        알아보고 저장합니다.
      </p>
      <PasteImportWidget />
    </div>
  );
}
