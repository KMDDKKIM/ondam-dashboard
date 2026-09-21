// 채팅은 별도 창(팝업)으로 연다. 창 이름을 고정해서 이미 열려 있으면 새로 만들지 않고 그 창을 앞으로 가져온다.
// 브라우저가 팝업을 막으면(popup === null) 같은 탭에서 채팅 화면으로 이동한다.
export function openChatWindow() {
  const width = 1000;
  const height = 720;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(
    '/chat',
    'ondam-chat',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );
  if (popup) {
    popup.focus();
  } else {
    window.location.assign('/chat');
  }
}
