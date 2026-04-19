'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: '⊞' },
  { label: 'Folders', href: '/folders', icon: '⊟' },
  { label: 'Goals', href: '/goals', icon: '◎' },
  { label: 'Savings', href: '/savings', icon: '◈' },
  { label: 'Investments', href: '/investments', icon: '◆' },
  { label: 'Insights', href: '/insights', icon: '◉' },
  { label: 'Import', href: '/import', icon: '⊕' },
  { label: 'Settings', href: '/settings', icon: '⊙' },
];

interface NavProps {
  expanded?: boolean;
}

export function Nav({ expanded = true }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
          >
            <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
            {expanded && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
