import type { HerbCompoundingOrder } from '@/lib/herbCompounding';
import { herbLineTotal, totalHerbWeight } from '@/lib/herbCompounding';

// 5줄마다 구분선을 넣어 약재가 많을 때도 한눈에 훑기 쉽게 한다(OK차트 출력 참고, 원장 요청 2026-09-29).
const GROUP_SIZE = 5;

// 조제할 때 보고 계량하는 인쇄용 처방전 한 장(A4 세로). herb-compounding.css의 @media print가
// 화면에서는 숨기고(print-only) 인쇄할 때만 보여준다(예약 시트 인쇄와 같은 방식).
export function PrintSheet({ order }: { order: HerbCompoundingOrder }) {
  const herbs = order.herbs.filter((h) => h.herbName.trim() !== '');
  const total = totalHerbWeight(herbs, order.packetCount);
  const decoctionRow =
    order.packVolumeMl > 0 || order.daysSupply > 0 || order.packCount > 0 || order.totalLiquidMl > 0;

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
          {decoctionRow && (
            <tr>
              <th>팩용량</th>
              <td>{order.packVolumeMl > 0 ? `${order.packVolumeMl}mL` : ''}</td>
              <th>며칠분</th>
              <td>{order.daysSupply > 0 ? `${order.daysSupply}일` : ''}</td>
            </tr>
          )}
          {decoctionRow && (
            <tr>
              <th>팩수</th>
              <td>{order.packCount > 0 ? `${order.packCount}팩` : ''}</td>
              <th>총물량</th>
              <td>{order.totalLiquidMl > 0 ? `${order.totalLiquidMl}mL` : ''}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 약재명 바로 옆에 1첩당·총용량을 두어 한눈에 보이게 하고, 수치(포제)는 참고용이라
          맨 끝 칸으로 뺐다(OK차트 출력 참고 — 약재명·총용량이 너무 멀리 떨어져 있다는 지적,
          원장 2026-09-29). */}
      <table className="rx-herb-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>약재명</th>
            <th>1첩당(g)</th>
            <th>총용량(g)</th>
            <th>수치</th>
          </tr>
        </thead>
        <tbody>
          {herbs.map((h, i) => (
            <tr key={i} className={(i + 1) % GROUP_SIZE === 0 ? 'rx-group-end' : undefined}>
              <td>{i + 1}</td>
              <td>{h.herbName}</td>
              <td>{h.gramsPerPacket}</td>
              <td>{herbLineTotal(h, order.packetCount)}</td>
              <td>{h.prepMethod}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>약재 총량</td>
            <td colSpan={2}>{total.toLocaleString('ko-KR')}g</td>
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
