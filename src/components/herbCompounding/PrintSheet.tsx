import type { HerbCompoundingOrder } from '@/lib/herbCompounding';
import { herbLineTotal, totalHerbWeight } from '@/lib/herbCompounding';

// 조제할 때 보고 계량하는 인쇄용 처방전 한 장(A4 세로). herb-compounding.css의 @media print가
// 화면에서는 숨기고(print-only) 인쇄할 때만 보여준다(예약 시트 인쇄와 같은 방식).
export function PrintSheet({ order }: { order: HerbCompoundingOrder }) {
  const herbs = order.herbs.filter((h) => h.herbName.trim() !== '');
  const total = totalHerbWeight(herbs, order.packetCount);

  return (
    <div className="rx-sheet">
      <h1>경희온담한의원 한약 처방전</h1>
      <table className="rx-header-table">
        <tbody>
          <tr>
            <th>환자명</th>
            <td>{order.patientName}</td>
            <th>차트번호</th>
            <td>{order.chartNo}</td>
          </tr>
          <tr>
            <th>날짜</th>
            <td>{order.orderDate}</td>
            <th>첩수</th>
            <td>{order.packetCount}첩</td>
          </tr>
        </tbody>
      </table>

      <table className="rx-herb-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>약재명</th>
            <th>1첩당(g)</th>
            <th>총용량(g)</th>
          </tr>
        </thead>
        <tbody>
          {herbs.map((h, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{h.herbName}</td>
              <td>{h.gramsPerPacket}</td>
              <td>{herbLineTotal(h, order.packetCount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>약재 총량</td>
            <td>{total.toLocaleString('ko-KR')}g</td>
          </tr>
        </tfoot>
      </table>

      {order.memo.trim() !== '' && (
        <div className="rx-memo">
          <div className="rx-memo-label">메모</div>
          <div>{order.memo}</div>
        </div>
      )}
    </div>
  );
}
