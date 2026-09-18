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
    <main style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>경희온담한의원 운영 대시보드</h1>
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
          placeholder="비밀번호"
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button type="submit" disabled={submitting} style={{ width: '100%', padding: 8 }}>
          로그인
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p style={{ marginTop: 16 }}>
        <a href="/signup">처음이신가요? 직원 가입 신청</a>
      </p>
    </main>
  );
}
