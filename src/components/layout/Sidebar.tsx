import { NavLink } from 'react-router-dom';
import { NAV_GROUPS, visibleNavItems } from '@/app/navigation';
import { useAdmin } from '@/admin/AdminProvider';
import { AccountFooter } from '@/components/layout/AccountFooter';
import { BrandMark } from '@/components/layout/BrandMark';

export function Sidebar() {
  const items = visibleNavItems(useAdmin().isAdmin);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy lg:flex">
      <div className="border-b border-white/10 px-6 py-6">
        <BrandMark />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-6">
        {NAV_GROUPS.map((group) => (
          <div key={group} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-white/50">
              {group}
            </p>
            <ul className="space-y-1">
              {items.filter((item) => item.group === group).map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    end={path === '/'}
                    className={({ isActive }) =>
                      [
                        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:ring-offset-navy',
                        isActive
                          ? 'bg-navy-lighter text-white'
                          : 'text-white/75 hover:bg-navy-light hover:text-white',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-gold transition-opacity duration-150 ${
                            isActive ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive ? 'text-gold' : 'text-white/60 group-hover:text-white'
                          }`}
                          aria-hidden="true"
                        />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-6 py-4">
        <AccountFooter />
      </div>
    </aside>
  );
}
