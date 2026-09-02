'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MORE_LINKS = [
  {
    section: 'Finance',
    items: [
      { label: 'Goals', href: '/goals', icon: '◎', description: 'Track savings & debt payoff' },
      { label: 'What If', href: '/what-if', icon: '🔮', description: 'Scenario calculator' },
      { label: 'Health Score', href: '/health-score', icon: '💪', description: 'Financial health check' },
      { label: 'Wishlist', href: '/wishlist', icon: '🎯', description: 'Annual financial goals' },
    ],
  },
  {
    section: 'History',
    items: [
      { label: 'History', href: '/history', icon: '◉', description: 'Past pay cycles' },
      { label: 'Review', href: '/review', icon: '📊', description: 'Year in review' },
      { label: 'Insights', href: '/insights', icon: '💡', description: 'AI-generated observations' },
    ],
  },
  {
    section: 'Tools',
    items: [
      { label: 'Import', href: '/import', icon: '⊕', description: 'Bank statements & emails' },
      { label: 'Settings', href: '/settings', icon: '⊙', description: 'Preferences & integrations' },
    ],
  },
];

export default function MorePage() {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">More</h1>

      {MORE_LINKS.map((section) => (
        <div key={section.section} className="space-y-2">
          <h2 className="text-sm font-medium text-text-secondary px-1">{section.section}</h2>
          <div className="grid gap-2">
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-surface hover:border-primary/50'
                  }`}
                >
                  <span className="text-2xl w-8 text-center">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text-primary">{item.label}</div>
                    <div className="text-sm text-text-secondary truncate">{item.description}</div>
                  </div>
                  <svg
                    className="w-5 h-5 text-text-secondary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
