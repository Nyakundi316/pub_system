/**
 * The single source of truth for RBAC. The seed writes these into `permissions`
 * and `role_permissions`; the route guards reference the same string keys.
 * '*' is a wildcard held only by System Admin.
 */

export const PERMISSIONS: Record<string, string> = {
  'sales.create': 'Ring up sales and open orders',
  'sales.pay': 'Take payment for a sale',
  'sales.discount': 'Apply discounts',
  'sales.void': 'Void a completed sale',
  'sales.refund': 'Refund a sale',
  'sales.comp': 'Give complimentary items',
  'tables.manage': 'Open, move, merge and close tabs',
  'inventory.view': 'View stock levels and movements',
  'inventory.adjust': 'Adjust stock quantities',
  'inventory.count': 'Run stock counts',
  'inventory.wastage': 'Record wastage / breakage',
  'inventory.transfer': 'Transfer stock',
  'purchasing.view': 'View suppliers and purchase orders',
  'purchasing.create': 'Create purchase orders',
  'purchasing.receive': 'Receive goods',
  'products.view': 'View the menu and recipes',
  'products.manage': 'Create and edit products and recipes',
  'customers.view': 'View customers and loyalty',
  'customers.manage': 'Create and edit customers',
  'shifts.open': 'Open a shift with a float',
  'shifts.close': 'Close a shift and count cash',
  'shifts.view': 'View shift data',
  'cash.manage': 'Record cash drops / payouts',
  'expenses.manage': 'Record operating expenses',
  'reports.view': 'View reports and analytics',
  'recommendations.view': 'View stock recommendations',
  'users.manage': 'Manage users',
  'roles.manage': 'Manage roles and permissions',
  'settings.manage': 'Manage system settings',
  'audit.view': 'View the audit trail',
};

export type PermissionKey = keyof typeof PERMISSIONS;

const BARTENDER = [
  'sales.create', 'sales.pay', 'sales.discount', 'tables.manage',
  'inventory.view', 'products.view', 'customers.view', 'shifts.view',
];

const WAITER = ['sales.create', 'tables.manage', 'products.view', 'customers.view', 'shifts.view'];

const CASHIER = [
  'sales.create', 'sales.pay', 'sales.refund', 'sales.void', 'tables.manage',
  'shifts.open', 'shifts.close', 'shifts.view', 'cash.manage', 'customers.view', 'products.view',
];

const STOREKEEPER = [
  'inventory.view', 'inventory.adjust', 'inventory.count', 'inventory.wastage', 'inventory.transfer',
  'purchasing.view', 'purchasing.create', 'purchasing.receive', 'products.view', 'recommendations.view',
];

const ACCOUNTANT = ['reports.view', 'expenses.manage', 'inventory.view', 'audit.view', 'recommendations.view', 'products.view'];

const MANAGER = [
  ...new Set([
    ...BARTENDER, ...CASHIER, ...STOREKEEPER, ...ACCOUNTANT,
    'sales.void', 'sales.refund', 'sales.comp', 'products.manage', 'customers.manage',
    'reports.view', 'recommendations.view', 'audit.view',
  ]),
];

const OWNER = [...new Set([...MANAGER, 'users.manage'])];

export interface RoleDefinition {
  name: string;
  description: string;
  landingPath: string;
  permissions: string[] | '*';
}

export const ROLES: RoleDefinition[] = [
  { name: 'Owner', description: 'Owner / Director — full business visibility', landingPath: '/dashboard', permissions: OWNER },
  { name: 'Manager', description: 'Runs the floor; all but system admin', landingPath: '/dashboard', permissions: MANAGER },
  { name: 'Bartender', description: 'Serves and rings up drinks', landingPath: '/pos', permissions: BARTENDER },
  { name: 'Waiter', description: 'Takes table orders', landingPath: '/tables', permissions: WAITER },
  { name: 'Cashier', description: 'Handles payment and the drawer', landingPath: '/pos', permissions: CASHIER },
  { name: 'Storekeeper', description: 'Owns stock and purchasing', landingPath: '/inventory', permissions: STOREKEEPER },
  { name: 'Accountant', description: 'Reports, expenses and audit', landingPath: '/reports', permissions: ACCOUNTANT },
  { name: 'System Admin', description: 'Full system + user administration', landingPath: '/settings', permissions: '*' },
];
