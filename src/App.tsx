import type { ReactElement, ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { NAV_ITEMS, type NavItem } from '@/app/navigation';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { FarmProvider, useFarm } from '@/farm/FarmProvider';
import { AppShell } from '@/components/layout/AppShell';
import { AlertsPage } from '@/pages/AlertsPage';
import { AuthPage } from '@/pages/AuthPage';
import { BriefPage } from '@/pages/BriefPage';
import { DeskChatPage } from '@/pages/DeskChatPage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { MarginPage } from '@/pages/MarginPage';
import { MarketsPage } from '@/pages/MarketsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { PositionPage } from '@/pages/PositionPage';
import { SectionPage } from '@/pages/SectionPage';

const PAGES: Record<string, () => ReactElement> = {
  '/': () => <OverviewPage />,
  '/position': () => <PositionPage />,
  '/margin': () => <MarginPage />,
  '/markets': () => <MarketsPage />,
  '/alerts': () => <AlertsPage />,
  '/documents': () => <DocumentsPage />,
  '/chat': () => <DeskChatPage />,
  '/brief': () => <BriefPage />,
};

const pageFor = (item: NavItem) => PAGES[item.path]?.() ?? <SectionPage item={item} />;

function FullScreenMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-cream px-4 text-center text-sm text-muted">{children}</div>;
}

function SignedInApp() {
  const { loading, error, retry } = useFarm();

  if (loading) {
    return (
      <FullScreenMessage>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Loading your farm…
      </FullScreenMessage>
    );
  }
  if (error) {
    return (
      <FullScreenMessage>
        <div>
          <p className="text-red-800">{error}</p>
          <button type="button" onClick={retry} className="mt-4 rounded-md bg-navy px-4 py-2 text-white hover:bg-navy-lighter">
            Try again
          </button>
        </div>
      </FullScreenMessage>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          {NAV_ITEMS.map((item) =>
            item.path === '/' ? (
              <Route key={item.path} index element={pageFor(item)} />
            ) : (
              <Route key={item.path} path={item.path.slice(1)} element={pageFor(item)} />
            ),
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <FullScreenMessage>
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
      </FullScreenMessage>
    );
  }
  if (!session) return <AuthPage />;
  return (
    <FarmProvider key={session.user.id}>
      <SignedInApp />
    </FarmProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
