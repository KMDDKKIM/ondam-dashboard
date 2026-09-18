import Link from 'next/link';

interface NavCardProps {
  href: string;
  label: string;
  sublabel: string;
  icon: string;
  accent: string;
  external?: boolean;
}

export function NavCard({ href, label, sublabel, icon, accent, external }: NavCardProps) {
  const content = (
    <>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 12,
          background: accent,
          fontSize: 20,
          marginBottom: 12,
        }}
      >
        {icon}
      </span>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{label}</div>
      <div className="muted-text">{sublabel}</div>
    </>
  );

  const style = {
    display: 'block',
    padding: '20px 18px',
    textDecoration: 'none',
    color: 'var(--color-ink)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  } as const;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="card" style={style}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className="card" style={style}>
      {content}
    </Link>
  );
}
