import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, X } from 'lucide-react';
import { isActivePath, visibleNavItems } from '@/app/navigation';
import { useAdmin } from '@/admin/AdminProvider';

const PRIMARY = visibleNavItems(false).filter((item) => item.primaryOnMobile);

const tabClass = (active: boolean) =>
  [
    'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors duration-150',
    active ? 'text-navy' : 'text-muted hover:text-navy',
  ].join(' ');

export function MobileTabBar() {
  const { pathname } = useLocation();
  const SECONDARY = visibleNavItems(useAdmin().isAdmin).filter((item) => !item.primaryOnMobile);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = SECONDARY.some((item) => isActivePath(item.path, pathname));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More pages">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full bg-navy/40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-rule bg-card pb-[calc(env(safe-area-inset-bottom)+72px)] shadow-sheet animate-sheet-up">
            <div className="flex items-center justify-between px-6 pb-2 pt-4">
              <p className="font-serif text-base font-bold text-navy">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-cream hover:text-navy"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="px-3 pb-2">
              {SECONDARY.map(({ path, label, description, icon: Icon }) => {
                const active = isActivePath(path, pathname);
                return (
                  <li key={path}>
                    <NavLink
                      to={path}
                      className={`flex min-h-[56px] items-center gap-4 rounded-lg px-3 py-3 transition-colors ${
                        active ? 'bg-cream' : 'hover:bg-cream'
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
                          active ? 'border-gold bg-navy text-gold' : 'border-rule bg-card text-navy'
                        }`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-navy">{label}</span>
                        <span className="block truncate text-xs text-muted">{description}</span>
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-rule bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="flex">
          {PRIMARY.map(({ path, label, icon: Icon }) => {
            const active = !moreOpen && isActivePath(path, pathname);
            return (
              <li key={path} className="flex flex-1">
                <NavLink to={path} end={path === '/'} className={tabClass(active)}>
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 ${
                      active ? 'bg-navy text-gold' : ''
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="truncate">{label}</span>
                </NavLink>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              className={tabClass(moreOpen || moreActive)}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 ${
                  moreOpen || moreActive ? 'bg-navy text-gold' : ''
                }`}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
