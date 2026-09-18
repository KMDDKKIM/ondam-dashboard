'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('비밀번호가 서로 다릅니다.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? '가입 신청에 실패했습니다.');
        return;
      }
      setDone(true);
    } catch {
      setError('가입 신청에 실패했습니다. 네트워크 상태를 확인해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main style={{ maxWidth: 320, margin: '80px auto' }}>
        <h1>가입 신청 완료</h1>
        <p>
          원장님이 승인하면 로그인할 수 있어요. 승인 전까지는 이름과 비밀번호로 로그인해도
          대기 화면만 보입니다.
        </p>
        <button
          onClick={() => router.push('/login')}
          style={{ width: '100%', padding: 8, marginTop: 8 }}
        >
          로그인 화면으로
        </button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>직원 가입 신청</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="이름"
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="비밀번호 (8자 이상)"
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <input
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          placeholder="비밀번호 확인"
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button type="submit" disabled={submitting} style={{ width: '100%', padding: 8 }}>
          가입 신청
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p style={{ marginTop: 16 }}>
        <a href="/login">이미 계정이 있으신가요? 로그인</a>
      </p>
    </main>
  );
}
