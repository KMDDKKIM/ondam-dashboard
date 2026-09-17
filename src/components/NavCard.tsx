import Link from 'next/link';
import type { CSSProperties } from 'react';

interface NavCardProps {
  href: string;
  label: string;
  external?: boolean;
}

const CARD_STYLE: CSSProperties = {
  display: 'block',
  padding: 24,
  border: '1px solid #ddd',
  borderRadius: 8,
  textDecoration: 'none',
  color: '#111',
  fontWeight: 600,
  textAlign: 'center',
};

export function NavCard({ href, label, external }: NavCardProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={CARD_STYLE}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} style={CARD_STYLE}>
      {label}
    </Link>
  );
}
