import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';

/** Router link used by the new shells; active page gets aria-current. */
export default function NavLinkItem({
  to,
  icon: Icon,
  label,
  active,
  className,
  hideLabelOnSmall = false,
  labelClassName,
}: {
  to: string;
  icon: ComponentType<{ size?: number }>;
  label: string;
  active: boolean;
  className: string;
  hideLabelOnSmall?: boolean;
  labelClassName?: string;
}) {
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} aria-label={label} title={label} className={className}>
      <span className="flex shrink-0"><Icon size={18} /></span>
      <span className={labelClassName ?? (hideLabelOnSmall ? 'hidden sm:inline' : undefined)}>{label}</span>
    </Link>
  );
}
