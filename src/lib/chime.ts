// 새 비대면진료 신청 알림음 — 소리 파일 없이 Web Audio API 로 "딩-동" 두 음을 만든다.
// 브라우저는 사용자가 화면을 한 번이라도 누르기 전에는 소리를 막으므로(자동 재생 제한), 첫 클릭·키 입력 때
// 오디오를 깨워 두고(unlockChimeOnFirstInteraction), 그 전에 신청이 오면 소리 없이 팝업만 뜬다.

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 첫 사용자 입력 때 오디오를 깨운다. 돌려주는 함수로 리스너를 뗀다. */
export function unlockChimeOnFirstInteraction(): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const unlock = () => {
    const c = getContext();
    if (!c) return;
    c.resume()
      .then(() => {
        if (c.state === 'running') remove();
      })
      .catch(() => {});
  };
  const remove = () => events.forEach((e) => window.removeEventListener(e, unlock));
  events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
  return remove;
}

function tone(c: AudioContext, frequency: number, start: number, duration: number, peak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** 짧은 "딩-동"(E6 → C6, 배음 살짝). 소리를 낼 수 없는 상태면 조용히 넘어간다. */
export async function playChime(): Promise<void> {
  const c = getContext();
  if (!c) return;
  try {
    if (c.state !== 'running') await c.resume();
  } catch {
    return;
  }
  if (c.state !== 'running') return;
  const t = c.currentTime + 0.02;
  tone(c, 1318.5, t, 0.9, 0.22);
  tone(c, 2637, t, 0.35, 0.04);
  tone(c, 1046.5, t + 0.28, 1.2, 0.22);
  tone(c, 2093, t + 0.28, 0.45, 0.04);
}
