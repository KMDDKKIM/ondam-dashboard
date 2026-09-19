import type { DailyRecordFull, DailyRecordSummary, Reservation } from './types';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function listDailyRecords(): Promise<DailyRecordSummary[]> {
  const response = await fetch('/api/records');
  return handleResponse<DailyRecordSummary[]>(response);
}

export async function getDailyRecordByDate(date: string): Promise<DailyRecordFull | null> {
  const response = await fetch(`/api/records/${encodeURIComponent(date)}`);
  return handleResponse<DailyRecordFull | null>(response);
}

export async function ensureDailyRecord(date: string): Promise<string> {
  const response = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  });
  const { id } = await handleResponse<{ id: string }>(response);
  return id;
}

export async function replaceReservations(
  dailyRecordId: string,
  rows: Reservation[]
): Promise<void> {
  const response = await fetch(
    `/api/records/${encodeURIComponent(dailyRecordId)}/reservations`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservations: rows }),
    }
  );
  await handleResponse<{ ok: true }>(response);
}
