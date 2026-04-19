'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Show only the most important items in the bottom tab bar
const MOBILE_NAV_ITEMS = [
  { label: 'Home', href: '/', icon: '⊞' },
  { label: 'Folders', href: '/folders', icon: '⊟' },
  { label: 'Goals', href: '/goals', icon: '◎' },
  { label: 'Savings', href: '/savings', icon: '◈' },
  { label: 'More', href: '/insights', icon: '⋯' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-border flex items-center z-40 sm:hidden">
      {MOBILE_NAV_ITEMS.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              isActive ? 'text-primary' : 'text-text-secondary'
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
