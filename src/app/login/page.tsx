'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    const supabase = createClient();

    // 이름 → 이메일 조회 (staff.name으로 auth.users.email을 찾는 DB 함수).
    // 이름이 없거나 함수 호출 자체가 실패해도 "이름 또는 비밀번호가 올바르지
    // 않습니다"로 뭉뚱그려, 어떤 이름이 등록돼 있는지 새지 않게 한다.
    const { data: email, error: lookupError } = await supabase.rpc(
      'email_for_staff_name',
      { p_name: name }
    );

    if (lookupError || !email) {
      setError('이름 또는 비밀번호가 올바르지 않습니다.');
      setSubmitting(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('이름 또는 비밀번호가 올바르지 않습니다.');
      setSubmitting(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <div className="card auth-card">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--color-brand-a), var(--color-brand-b))',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 16,
          }}
        >
          경
        </span>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>경희온담한의원</h1>
        <p className="muted-text" style={{ marginBottom: 24 }}>
          운영 대시보드에 로그인하세요.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름"
            className="input-field"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            className="input-field"
          />
          <button type="submit" disabled={submitting} className="btn-primary" style={{ marginTop: 6 }}>
            로그인
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
        <p className="muted-text" style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/signup" style={{ color: 'var(--color-blue)', fontWeight: 600 }}>
            처음이신가요? 직원 가입 신청
          </a>
        </p>
      </div>
    </main>
  );
}
