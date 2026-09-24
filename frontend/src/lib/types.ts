export interface AuthUser {
  id: number;
  username: string;
  name: string;
  roleId: number;
  roleName: string;
  permissions: string[];
}

export interface Product {
  id: number;
  categoryId: number;
  sku: string;
  name: string;
  productType: 'SIMPLE' | 'RECIPE' | 'SERVICE';
  sellingPrice: number;
  costPrice: number;
  taxable: boolean;
  isActive: boolean;
  grossProfit: number;
  grossMarginPct: number;
  pourCostPct: number;
  category?: { id: number; name: string };
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface StockItem {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  costPrice: number;
  reorderPoint: number;
  parLevel: number;
  currentStock: number;
  isActive: boolean;
  low?: boolean;
  over?: boolean;
  supplier?: { name: string } | null;
}

export interface Recommendation {
  itemId: number;
  name: string;
  action: string;
  priority: 1 | 2 | 3 | 4 | 5;
  abcClass: 'A' | 'B' | 'C';
  reason: string;
  suggestedOrderQty?: number;
  metrics: { daysOfCover: number | null; marginPct: number; unitsSold: number; variancePct: number | null };
}

export interface CartLine {
  product: Product;
  quantity: number;
}
