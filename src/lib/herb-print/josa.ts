function hasBatchim(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lastChar = trimmed[trimmed.length - 1];
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function endsWithRieul(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lastChar = trimmed[trimmed.length - 1];
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 === 8;
}

export function josaEunNeun(text: string): "은" | "는" {
  return hasBatchim(text) ? "은" : "는";
}

export function josaEuroRo(text: string): "으로" | "로" {
  return hasBatchim(text) && !endsWithRieul(text) ? "으로" : "로";
}

export function josaGwaWa(text: string): "과" | "와" {
  return hasBatchim(text) ? "과" : "와";
}
