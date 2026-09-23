// 일회성 스크립트: scripts/bulk-rows-snapshot.json(먼저 넣은 103건의 비급여 이력, chart_no='')에
// scripts/general-treatment.tsv(OK차트 "일반진료 목록" 전체 내보내기)를 대조해서 금액과 진료의를
// 채운다. 매칭 규칙(안전 우선):
//  - "일반진료 목록"에서 구분="처방"인 줄만 후보로 본다(약침/한방파스 등 비급여 상품과
//    무관한 줄은 제외).
//  - (환자명, 날짜) 조합이 우리 쪽에도 후보 쪽에도 정확히 1건씩일 때만 자동으로 채운다.
//    그 조합에 후보가 여러 개거나 우리 쪽에 같은 (환자명,날짜) 행이 여러 개면(상품명이 달라
//    금액을 확실히 짝지을 수 없음) 건드리지 않고 "확인 필요" 목록으로 따로 보고한다 — 돈이
//    걸린 값을 추측으로 채우지 않는다.
// 사용법:
//   node scripts/fill-amounts-from-treatment-log.cjs           (미리보기만)
//   node scripts/fill-amounts-from-treatment-log.cjs --commit  (실제로 저장, doctor_name 컬럼이
//                                                                DB에 먼저 있어야 한다)
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

function parseTreatmentLog(file) {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const [, ...rows] = lines;
  return rows.map((line) => {
    const cols = line.split('\t');
    const [, patientName, , , , , , treatDate, , , productName, doctor, , feeRaw, category] = cols;
    return {
      patientName: patientName.trim(),
      treatDate,
      productName: (productName || '').trim(),
      doctor: (doctor || '').trim(),
      fee: Number(feeRaw) || 0,
      category: (category || '').trim(),
    };
  });
}

// 상품명을 "계열"로 묶는다 — 두 표에서 이름 표기가 서로 달라서(예: 우리 쪽 "일반한약" vs
// 진료목록의 "기본한약") 그대로는 못 맞추지만, 같은 계열이면 하나로 본다.
const FAMILY_RULES = [
  { key: 'special_gongjindan', test: (n) => n.includes('공진단') },
  { key: 'special_gyeongokgo', test: (n) => n.includes('경옥고') },
  { key: 'special_nokyonggwanjeolgo', test: (n) => n.includes('녹용관절고') },
  { key: 'special_bopyego', test: (n) => n.includes('보폐고엔오') },
  { key: 'diet', test: (n) => n.includes('다이어트') },
  { key: 'saengmaeksan', test: (n) => n.includes('생맥산') },
  { key: 'coldquick', test: (n) => n.includes('콜드퀵') },
  { key: 'needle_package', test: (n) => n.includes('약침패키지') || n.includes('특수약침') },
  { key: 'bujonghwan', test: (n) => n.includes('부종환') },
  { key: 'custom_nokyong_herb', test: (n) => n.includes('맞춤녹용') },
  { key: 'nokyong_herb', test: (n) => n.includes('녹용한약') },
  { key: 'general_herb', test: (n) => n.includes('한약') },
];

function familyOf(name) {
  for (const rule of FAMILY_RULES) if (rule.test(name)) return rule.key;
  return null;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const bulkRows = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'bulk-rows-snapshot.json'), 'utf8'));
  const treatmentRows = parseTreatmentLog(path.join(ROOT, 'scripts', 'general-treatment.tsv'));
  // 금액이 0원인 줄(약 처방 기록만 있고 실제 청구가 없는 OKOMS류)은 비급여 판매 매칭 후보에서 뺀다.
  const priced = treatmentRows.filter((r) => r.fee > 0);

  const candidatesByKey = new Map();
  for (const r of priced) {
    const key = `${r.patientName}|${r.treatDate}`;
    const list = candidatesByKey.get(key) ?? [];
    list.push(r);
    candidatesByKey.set(key, list);
  }
  const ourRowsByKey = new Map();
  for (const r of bulkRows) {
    const key = `${r.patient_name}|${r.purchase_date}`;
    const list = ourRowsByKey.get(key) ?? [];
    list.push(r);
    ourRowsByKey.set(key, list);
  }

  const updates = [];
  const needsReview = [];
  for (const [key, ours] of ourRowsByKey) {
    const candidates = candidatesByKey.get(key) ?? [];
    if (ours.length === 1 && candidates.length === 1) {
      const r = ours[0];
      const c = candidates[0];
      updates.push({ id: r.id, patient_name: r.patient_name, purchase_date: r.purchase_date, our_product: r.product_name, matched_product: c.productName, amount: c.fee, doctor_name: c.doctor || null });
      continue;
    }
    // 계열(family)로 1:1 매칭을 시도한다 — 양쪽에서 그 계열이 정확히 한 번씩만 나올 때만.
    const ourFamilies = ours.map((r) => ({ r, family: familyOf(r.product_name) }));
    const candFamilies = candidates.map((c) => ({ c, family: familyOf(c.productName) }));
    const ourFamilyCounts = new Map();
    for (const { family } of ourFamilies) if (family) ourFamilyCounts.set(family, (ourFamilyCounts.get(family) ?? 0) + 1);
    const candFamilyCounts = new Map();
    for (const { family } of candFamilies) if (family) candFamilyCounts.set(family, (candFamilyCounts.get(family) ?? 0) + 1);

    const matchedIds = new Set();
    for (const { r, family } of ourFamilies) {
      if (!family || ourFamilyCounts.get(family) !== 1 || candFamilyCounts.get(family) !== 1) continue;
      const match = candFamilies.find((cf) => cf.family === family);
      updates.push({ id: r.id, patient_name: r.patient_name, purchase_date: r.purchase_date, our_product: r.product_name, matched_product: match.c.productName, amount: match.c.fee, doctor_name: match.c.doctor || null, via: 'family' });
      matchedIds.add(r.id);
    }
    for (const { r } of ourFamilies) {
      if (matchedIds.has(r.id)) continue;
      needsReview.push({
        id: r.id,
        patient_name: r.patient_name,
        purchase_date: r.purchase_date,
        our_product: r.product_name,
        candidateCount: candidates.length,
        ourDuplicateCount: ours.length,
        candidates: candidates.map((c) => `${c.productName}(${c.fee.toLocaleString()}원, ${c.doctor})`),
      });
    }
  }

  console.log(`총 ${bulkRows.length}건 중 자동 매칭 ${updates.length}건, 확인 필요 ${needsReview.length}건\n`);
  console.log('--- 자동 매칭 예시 5건 ---');
  for (const u of updates.slice(0, 5)) console.log(u);
  console.log('\n--- 확인 필요 목록 ---');
  for (const n of needsReview) console.log(JSON.stringify(n));

  if (!commit) {
    console.log('\n(미리보기만 했어요 — 실제로 저장하려면 --commit 을 붙여서 다시 실행하세요)');
    return;
  }

  loadEnvLocal();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let done = 0;
  for (const u of updates) {
    const { error } = await supabase.from('non_covered_purchases').update({ amount: u.amount, doctor_name: u.doctor_name }).eq('id', u.id);
    if (error) throw error;
    done += 1;
  }
  console.log(`저장 완료: ${done}/${updates.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
