/**
 * The Greek-key (meander) rule — a bronze threshold that marks a ceremony
 * surface. Used only on the ballot receipt, live results, and sortition
 * draw. Purely decorative; hidden from assistive tech.
 */
export function GreekKeyRule({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 640 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: 14, color: 'var(--bronze)' }}
    >
      <defs>
        <pattern id="agora-key" width="16" height="14" patternUnits="userSpaceOnUse">
          <path
            d="M0 11 L0 3 L8 3 L8 11 L16 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <rect width="640" height="14" fill="url(#agora-key)" />
    </svg>
  );
}
