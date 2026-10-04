import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isActivePath, visibleNavItems } from '@/app/navigation';

describe('navigation', () => {
  it('lists the ten pages in order', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Position',
      'Margin',
      'Markets',
      'Alerts',
      'Documents',
      'Desk chat',
      'Brief',
      'Settings',
      'Admin',
    ]);
  });

  it('gives every page a unique path and a description', () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
    NAV_ITEMS.forEach((item) => expect(item.description.length).toBeGreaterThan(0));
  });

  it('keeps five pages on the phone tab bar', () => {
    expect(NAV_ITEMS.filter((item) => item.primaryOnMobile)).toHaveLength(5);
  });

  it('hides Admin from people who are not desk admins', () => {
    expect(visibleNavItems(false).some((item) => item.path === '/admin')).toBe(false);
    expect(visibleNavItems(true).some((item) => item.path === '/admin')).toBe(true);
  });

  it('matches active paths without treating Overview as a prefix', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/', '/position')).toBe(false);
    expect(isActivePath('/admin', '/admin/security')).toBe(true);
    expect(isActivePath('/admin', '/administrator')).toBe(false);
  });
});
