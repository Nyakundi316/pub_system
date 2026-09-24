import {
  LayoutDashboard,
  Wine,
  Table2,
  Boxes,
  Truck,
  BookOpenText,
  Users,
  Clock,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Any one of these permissions grants visibility. Empty = always visible. */
  anyOf: string[];
}

// Order matters — this is the sidebar reading order.
export const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, anyOf: ['reports.view', 'shifts.view'] },
  { to: '/pos', label: 'POS · New Sale', icon: Wine, anyOf: ['sales.create'] },
  { to: '/tables', label: 'Tables & Tabs', icon: Table2, anyOf: ['tables.manage', 'sales.create'] },
  { to: '/inventory', label: 'Inventory', icon: Boxes, anyOf: ['inventory.view'] },
  { to: '/purchasing', label: 'Purchasing', icon: Truck, anyOf: ['purchasing.view'] },
  { to: '/products', label: 'Products & Menu', icon: BookOpenText, anyOf: ['products.view'] },
  { to: '/customers', label: 'Customers', icon: Users, anyOf: ['customers.view'] },
  { to: '/shifts', label: 'Staff & Shifts', icon: Clock, anyOf: ['shifts.view'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, anyOf: ['reports.view'] },
  { to: '/settings', label: 'Settings', icon: Settings, anyOf: ['users.manage', 'roles.manage', 'settings.manage'] },
];
