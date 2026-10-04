import { Outlet } from 'react-router-dom';
import { AccountFooter } from '@/components/layout/AccountFooter';
import { BrandMark } from '@/components/layout/BrandMark';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppShell() {
  return (
    <div className="min-h-screen bg-cream">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-navy focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar />

      <header className="sticky top-0 z-30 flex min-h-14 items-center bg-navy px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <BrandMark compact />
        <AccountFooter compact />
      </header>

      <main
        id="main"
        className="pb-[calc(env(safe-area-inset-bottom)+88px)] lg:pb-0 lg:pl-64"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>

      <MobileTabBar />
    </div>
  );
}
