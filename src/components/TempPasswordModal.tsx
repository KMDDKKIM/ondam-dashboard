'use client';

import { useEffect, useRef, useState } from 'react';

interface TempPasswordModalProps {
  name: string;
  password: string;
  onClose: () => void;
}

// 클립보드 권한이 없는 환경(http 등)에서는 숨은 글상자를 골라 복사 명령으로 대신한다.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(area);
    }
  }
}

// 재설정으로 만든 임시 비밀번호를 한 번만 보여주는 창. 닫으면 부모가 값을 비우므로 다시 볼 수 없다.
export function TempPasswordModal({ name, password, onClose }: TempPasswordModalProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function handleCopy() {
    const ok = await copyText(password);
    setCopied(ok);
    setCopyFailed(!ok);
  }

  return (
    <div
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(43, 42, 39, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="임시 비밀번호"
        className="card"
        style={{ maxWidth: 460, width: '100%', padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
      >
        <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>
          &quot;{name}&quot; 님의 새 비밀번호
        </p>
        <div
          style={{
            padding: '16px 12px',
            marginBottom: 12,
            textAlign: 'center',
            borderRadius: 10,
            border: '1px solid var(--color-line)',
            background: 'var(--color-surface-2)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 2,
            userSelect: 'all',
            wordBreak: 'break-all',
          }}
        >
          {password}
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>
          이 비밀번호는 지금 한 번만 보여요. 직원에게 전하고, 로그인 후 &quot;내 계정&quot;에서 바꾸라고 안내해주세요.
        </p>
        <p className="muted-text" style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
          이미 로그인해 둔 기기는 최대 1시간 정도 그대로 쓰일 수 있어요. 계정이 도용된 것 같다면 그 직원의 계정을 삭제하고 다시 가입시키세요.
        </p>
        {copyFailed && (
          <p className="error-text" style={{ margin: '0 0 12px' }}>
            복사하지 못했어요. 위 비밀번호를 직접 선택해서 복사해주세요.
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface-2)' }}
          >
            {copied ? '복사됨 ✓' : '복사'}
          </button>
          <button ref={closeRef} type="button" className="btn-primary" onClick={onClose} style={{ padding: '10px 20px' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
