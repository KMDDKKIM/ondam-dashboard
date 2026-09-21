'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { validateNewPassword } from '@/lib/tempPassword';

export default function AccountPage() {
  const [name, setName] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('staff')
          .select('name, grade')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setName(data?.name ?? null);
        setGrade(data?.grade ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const invalid = validateNewPassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (password !== passwordConfirm) {
      setError('새 비밀번호와 확인 입력이 서로 달라요.');
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(
          /same.*password|different from the old/i.test(updateError.message)
            ? '지금 쓰는 비밀번호와 다른 비밀번호를 입력해주세요.'
            : '비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해주세요.'
        );
        return;
      }
      setPassword('');
      setPasswordConfirm('');
      setMessage('비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.');
    } catch {
      setError('비밀번호를 바꾸지 못했어요. 네트워크 상태를 확인해주세요.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>내 계정</h1>
      <p className="muted-text" style={{ marginBottom: 24 }}>
        내 정보를 확인하고 비밀번호를 바꿀 수 있어요.
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 20, maxWidth: 480 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>내 정보</h2>
        <p style={{ margin: '0 0 6px' }}>
          <span className="muted-text">이름 </span>
          <span style={{ fontWeight: 600 }}>{name ?? '-'}</span>
        </p>
        <p style={{ margin: 0 }}>
          <span className="muted-text">등급 </span>
          <span style={{ fontWeight: 600 }}>{grade ?? '-'}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ padding: 20, maxWidth: 480 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>비밀번호 변경</h2>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }} htmlFor="new-password">
          새 비밀번호
        </label>
        <input
          id="new-password"
          className="input-field"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="8자 이상"
          style={{ marginBottom: 12 }}
        />
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }} htmlFor="new-password-confirm">
          새 비밀번호 확인
        </label>
        <input
          id="new-password-confirm"
          className="input-field"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          placeholder="한 번 더 입력"
        />
        {error && <p className="error-text">{error}</p>}
        {message && (
          <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, margin: '12px 0 0' }}>{message}</p>
        )}
        <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: 16 }}>
          {saving ? '바꾸는 중...' : '비밀번호 변경'}
        </button>
      </form>
    </div>
  );
}
