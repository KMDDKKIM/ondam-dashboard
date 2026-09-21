// 비대면진료 구글폼 응답 시트 → 대시보드 자동 전송 (Google Apps Script)
//
// 설치 (구글 시트에서 한 번만):
//  1) 응답 시트 메뉴 "확장 프로그램 > Apps Script" 를 열고, 이 파일 내용을 붙여넣어 저장한다.
//  2) 왼쪽 "프로젝트 설정(톱니바퀴) > 스크립트 속성"에 두 값을 추가한다.
//       INGEST_URL    = https://(배포한 대시보드 주소)/api/remote-consult/ingest
//       INGEST_SECRET = 대시보드 서버의 REMOTE_CONSULT_INGEST_SECRET 과 같은 값
//  3) 왼쪽 "트리거(시계)" > 트리거 추가: 함수 onFormSubmit / 이벤트 소스 "스프레드시트에서" / 이벤트 유형 "양식 제출 시".
//     처음 저장할 때 권한 승인 창이 뜨면 허용한다.
//
// 동작: 폼이 제출될 때마다 그 한 건(질문 제목 → 답)을 대시보드로 보낸다. 같은 응답이 두 번 가도
// 대시보드가 한 번만 저장한다. 전송이 실패하면 오류가 나서 "트리거 > 실행 내역"과 알림 메일에 남는다.
function onFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INGEST_URL');
  var secret = props.getProperty('INGEST_SECRET');
  if (!url || !secret) throw new Error('스크립트 속성 INGEST_URL / INGEST_SECRET 을 먼저 설정하세요.');

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ namedValues: e.namedValues }),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code >= 300) {
    throw new Error('대시보드 전송 실패 ' + code + ': ' + response.getContentText());
  }
}
