import { Header } from '@/components/layout/header';
import { Nav } from '@/components/layout/nav';
import { MobileNav } from '@/components/layout/mobile-nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Side nav — hidden on mobile, visible on sm+ */}
        <aside className="hidden sm:flex flex-col w-52 lg:w-64 shrink-0 border-r border-border bg-surface overflow-y-auto">
          <Nav expanded={true} />
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto pb-16 sm:pb-0">
          {/* Three-column inner layout on lg+ */}
          <div className="h-full lg:grid lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 p-4 sm:p-6">
              {children}
            </div>
            {/* Right panel slot — only visible on lg+ */}
            <aside className="hidden lg:block border-l border-border bg-surface/50 p-4 overflow-y-auto" />
          </div>
        </main>
      </div>

      {/* Bottom tab bar — mobile only */}
      <MobileNav />
    </div>
  );
}
