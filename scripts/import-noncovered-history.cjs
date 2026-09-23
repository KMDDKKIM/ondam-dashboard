// 일회성 스크립트(2026-09-23 실행 완료): scripts/noncovered-history.tsv(OK차트에서 붙여넣은
// 100일치 비급여 처방 내역, 환자 이름·전화번호 등 개인정보 포함)를 non_covered_purchases
// 테이블에 넣는다. 그 tsv 파일은 개인정보라 .gitignore로 막아 두었다 — 이 저장소가 공개
// 저장소라 절대 커밋하면 안 된다(로컬에만 두고 다 쓰면 지운다). 사용법:
//   node scripts/import-noncovered-history.cjs           (미리보기만, DB에 쓰지 않음)
//   node scripts/import-noncovered-history.cjs --commit  (실제로 저장)
//
// 사용자와 합의한 규칙:
//  - 차트번호 칸이 원본에 없어 빈 값('')으로 둔다(나중에 같은 환자가 다시 오면 정상적으로
//    새 차트번호로 등록하면 된다 — 통계는 차트번호를 쓰지 않는다).
//  - "처방 N일차"는 처방한 날을 1일차로 세는 관례로 보고 purchaseDate = 오늘 - (N-1)일로 계산한다.
//  - 목표(goal_category) 자동 분류: 공진단/경옥고/녹용관절고/보폐고엔오 → special_herb(기존 등록
//    폼과 동일한 규칙, suggestGoalCategory), 린다이어트 → diet, "한약"이 포함된 이름(일반한약·
//    맞춤녹용한약·녹용한약) → herb. 그 밖(특수약침 패키지·생맥산·콜드퀵·부종환 등)은 애매해서
//    비워 둔다(나중에 필요하면 개별로 수정).
//  - happy_call_date는 넣지 않는다(이미 지난 과거 구매라 지금 해피콜을 새로 걸면 안 된다).
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const TODAY = '2026-09-23'; // 이 표를 붙여넣은 날짜(오늘) 기준으로 "N일차"를 역산한다.

function loadEnvLocal() {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

function addDaysKst(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d));
  result.setUTCDate(result.getUTCDate() + n);
  return result.toISOString().slice(0, 10);
}

const SPECIAL_HERB_PRODUCTS = ['공진단', '경옥고', '녹용관절고', '보폐고엔오'];

function inferGoalCategory(productName) {
  if (SPECIAL_HERB_PRODUCTS.some((k) => productName.includes(k))) return 'special_herb';
  if (productName.includes('린다이어트')) return 'diet';
  if (productName.includes('한약')) return 'herb';
  return null;
}

function parseTsv(file) {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const [, ...rows] = lines; // 첫 줄(헤더) 제외
  return rows.map((line) => {
    const cols = line.split('\t');
    const [patientName, phoneRaw, , , , productNameRaw, statusRaw, , , , doctorRaw] = cols;
    const dayMatch = statusRaw.match(/(\d+)일차/);
    if (!dayMatch) throw new Error(`처방 상태를 못 읽었어요: "${statusRaw}" (환자: ${patientName})`);
    const elapsedDays = Number(dayMatch[1]) - 1; // 처방한 날 = 1일차
    const purchaseDate = addDaysKst(TODAY, -elapsedDays);
    const productName = productNameRaw.trim();
    const phone = phoneRaw.trim() || null;
    const doctor = (doctorRaw || '').trim();
    return {
      patient_name: patientName.trim(),
      chart_no: '',
      phone,
      category: '일반',
      product_name: productName,
      amount: null,
      purchase_date: purchaseDate,
      memo: doctor ? `진료의: ${doctor}` : null,
      happy_call_date: null,
      duration_days: null,
      goal_category: inferGoalCategory(productName),
      created_by: null,
    };
  });
}

function summarize(rows) {
  const byGoal = new Map();
  let minDate = rows[0].purchase_date;
  let maxDate = rows[0].purchase_date;
  for (const r of rows) {
    const key = r.goal_category ?? '(없음)';
    byGoal.set(key, (byGoal.get(key) ?? 0) + 1);
    if (r.purchase_date < minDate) minDate = r.purchase_date;
    if (r.purchase_date > maxDate) maxDate = r.purchase_date;
  }
  console.log(`총 ${rows.length}건, 구매일 범위 ${minDate} ~ ${maxDate}`);
  for (const [k, v] of [...byGoal.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  목표(${k}): ${v}건`);
  }
  console.log('예시 3건:');
  for (const r of rows.slice(0, 3)) console.log('  ', r);
}

async function main() {
  const commit = process.argv.includes('--commit');
  const rows = parseTsv(path.join(ROOT, 'scripts', 'noncovered-history.tsv'));
  summarize(rows);

  if (!commit) {
    console.log('\n(미리보기만 했어요 — 실제로 저장하려면 --commit 을 붙여서 다시 실행하세요)');
    return;
  }

  loadEnvLocal();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('non_covered_purchases').insert(batch);
    if (error) throw error;
    inserted += batch.length;
    console.log(`저장됨: ${inserted}/${rows.length}`);
  }
  console.log('완료');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
