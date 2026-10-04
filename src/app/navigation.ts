import {
  Activity,
  Bell,
  Calculator,
  FileText,
  Layers,
  LayoutDashboard,
  MessagesSquare,
  Newspaper,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export type NavGroup = 'Farm' | 'Desk' | 'Account';

export interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: NavGroup;
  primaryOnMobile: boolean;
}

export const NAV_GROUPS: NavGroup[] = ['Farm', 'Desk', 'Account'];

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Overview',
    description:
      'Where you stand today across every crop: committed, unsold, this week’s move and margin against breakeven.',
    icon: LayoutDashboard,
    group: 'Farm',
    primaryOnMobile: true,
  },
  {
    path: '/position',
    label: 'Position',
    description:
      'Your stock, contracts, targets and quotes across every merchant, with market moves shown in pounds for your farm.',
    icon: Layers,
    group: 'Farm',
    primaryOnMobile: true,
  },
  {
    path: '/margin',
    label: 'Margin',
    description:
      'Grain price minus fertiliser and fuel, per hectare and per tonne, against your breakeven.',
    icon: Calculator,
    group: 'Farm',
    primaryOnMobile: true,
  },
  {
    path: '/markets',
    label: 'Markets',
    description:
      'Grain, fertiliser and fuel prices side by side, with the source and date for every series.',
    icon: Activity,
    group: 'Farm',
    primaryOnMobile: false,
  },
  {
    path: '/alerts',
    label: 'Alerts',
    description: 'Alerts set on your own numbers, and every message the desk has sent you.',
    icon: Bell,
    group: 'Desk',
    primaryOnMobile: true,
  },
  {
    path: '/documents',
    label: 'Documents',
    description:
      'Upload merchant contracts, quotes and settlements to check them before they reach your ledger.',
    icon: FileText,
    group: 'Desk',
    primaryOnMobile: false,
  },
  {
    path: '/chat',
    label: 'Desk chat',
    description:
      'Ask about your position, margins and quotes. Every answer uses your farm’s own figures.',
    icon: MessagesSquare,
    group: 'Desk',
    primaryOnMobile: true,
  },
  {
    path: '/brief',
    label: 'Brief',
    description: 'The daily market brief, with a section worked out for your farm.',
    icon: Newspaper,
    group: 'Desk',
    primaryOnMobile: false,
  },
  {
    path: '/settings',
    label: 'Settings',
    description: 'Farm details, members, notifications, consent and your data.',
    icon: Settings,
    group: 'Account',
    primaryOnMobile: false,
  },
  {
    path: '/admin',
    label: 'Admin',
    description: 'Desk tools for approvals, sources, costs and self-tests.',
    icon: ShieldCheck,
    group: 'Account',
    primaryOnMobile: false,
  },
];

export function isActivePath(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
