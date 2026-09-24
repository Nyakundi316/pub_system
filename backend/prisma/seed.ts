import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, ROLES } from '../src/config/permissions';

const prisma = new PrismaClient();

// Small deterministic RNG so reseeds produce the same demo data.
let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

// Ride through transient pooled-connection drops (P1001) / closed transactions
// (P2028) — Prisma reconnects on the next query, so a retry just works.
const TRANSIENT = new Set(['P1001', 'P2028', 'P1017']);
async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!TRANSIENT.has((e as { code?: string }).code ?? '')) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

async function reset() {
  // Delete in FK-safe order.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.loyaltyTransaction.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.cashMovement.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.wastage.deleteMany(),
    prisma.stockCountItem.deleteMany(),
    prisma.stockCount.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.goodsReceivedItem.deleteMany(),
    prisma.goodsReceived.deleteMany(),
    prisma.purchaseOrderItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.productIngredient.deleteMany(),
    prisma.product.deleteMany(),
    prisma.productCategory.deleteMany(),
    prisma.stockItem.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.tab.deleteMany(),
    prisma.table.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.user.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.customer.deleteMany(),
  ]);
}

async function seedAccessControl() {
  await prisma.permission.createMany({
    data: Object.entries(PERMISSIONS).map(([name, description]) => ({ name, description })),
  });
  const allPerms = await prisma.permission.findMany();
  const permId = new Map(allPerms.map((p) => [p.name, p.id]));

  const roleByName = new Map<string, number>();
  for (const def of ROLES) {
    const role = await prisma.role.create({ data: { name: def.name, description: def.description, landingPath: def.landingPath } });
    roleByName.set(def.name, role.id);
    const perms = def.permissions === '*' ? allPerms.map((p) => p.name) : def.permissions;
    await prisma.rolePermission.createMany({ data: perms.map((name) => ({ roleId: role.id, permissionId: permId.get(name)! })) });
  }
  return roleByName;
}

async function seedUsers(roleByName: Map<string, number>) {
  const passwordHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('1234', 10);
  let n = 0;
  for (const def of ROLES) {
    const slug = def.name.toLowerCase().replace(/[^a-z]/g, '');
    for (let i = 1; i <= 2; i++) {
      n++;
      await prisma.user.create({
        data: {
          name: `${def.name} ${i}`,
          username: `${slug}${i}`,
          passwordHash,
          pinHash,
          phone: `+25470000${String(n).padStart(4, '0')}`,
          roleId: roleByName.get(def.name)!,
        },
      });
    }
  }
}

interface StockSeed {
  sku: string; name: string; category: string; unit: string; cost: number;
  reorder: number; par: number; current: number; supplier: string;
}

const SUPPLIERS = [
  { name: 'EABL Distributors', leadTimeDays: 2, paymentTerms: 'Net 14' },
  { name: 'Kenya Wine Agencies', leadTimeDays: 4, paymentTerms: 'Net 30' },
  { name: 'Coastal Spirits Ltd', leadTimeDays: 3, paymentTerms: 'Net 7' },
  { name: 'Fresh Garnish Co', leadTimeDays: 1, paymentTerms: 'COD' },
  { name: 'Highland Softs', leadTimeDays: 2, paymentTerms: 'Net 14' },
];

const STOCK: StockSeed[] = [
  { sku: 'BEER-TUSK', name: 'Tusker Lager 500ml', category: 'Beer', unit: 'bottle', cost: 120, reorder: 48, par: 300, current: 210, supplier: 'EABL Distributors' },
  { sku: 'BEER-GUIN', name: 'Guinness 500ml', category: 'Beer', unit: 'bottle', cost: 150, reorder: 36, par: 200, current: 22, supplier: 'EABL Distributors' },
  { sku: 'BEER-WHITE', name: 'White Cap 500ml', category: 'Beer', unit: 'bottle', cost: 125, reorder: 36, par: 200, current: 160, supplier: 'EABL Distributors' },
  { sku: 'SPIR-GIN', name: 'House Gin', category: 'Spirits', unit: 'ml', cost: 0.9, reorder: 1500, par: 6000, current: 4200, supplier: 'Coastal Spirits Ltd' },
  { sku: 'SPIR-VOD', name: 'House Vodka', category: 'Spirits', unit: 'ml', cost: 0.85, reorder: 1500, par: 6000, current: 5200, supplier: 'Coastal Spirits Ltd' },
  { sku: 'SPIR-WHIS', name: 'Blended Whisky', category: 'Spirits', unit: 'ml', cost: 1.4, reorder: 1000, par: 5000, current: 900, supplier: 'Coastal Spirits Ltd' },
  { sku: 'WINE-RED', name: 'House Red Wine', category: 'Wine', unit: 'ml', cost: 0.6, reorder: 2000, par: 9000, current: 8600, supplier: 'Kenya Wine Agencies' },
  { sku: 'WINE-WHT', name: 'House White Wine', category: 'Wine', unit: 'ml', cost: 0.6, reorder: 2000, par: 9000, current: 3000, supplier: 'Kenya Wine Agencies' },
  { sku: 'MIX-TONIC', name: 'Tonic Water 200ml', category: 'Mixers', unit: 'bottle', cost: 45, reorder: 60, par: 300, current: 240, supplier: 'Highland Softs' },
  { sku: 'SOFT-COKE', name: 'Coca-Cola 300ml', category: 'Soft Drinks', unit: 'bottle', cost: 40, reorder: 72, par: 360, current: 300, supplier: 'Highland Softs' },
  { sku: 'SOFT-SODA', name: 'Soda Water 300ml', category: 'Soft Drinks', unit: 'bottle', cost: 35, reorder: 48, par: 240, current: 150, supplier: 'Highland Softs' },
  { sku: 'GARN-LIME', name: 'Fresh Lime', category: 'Garnish', unit: 'piece', cost: 8, reorder: 40, par: 200, current: 60, supplier: 'Fresh Garnish Co' },
  { sku: 'GARN-ICE', name: 'Ice', category: 'Garnish', unit: 'kg', cost: 25, reorder: 20, par: 120, current: 80, supplier: 'Fresh Garnish Co' },
  { sku: 'SPIR-OLD', name: 'Vintage Cognac (slow)', category: 'Spirits', unit: 'ml', cost: 3.2, reorder: 500, par: 3000, current: 2800, supplier: 'Coastal Spirits Ltd' },
];

interface ProductSeed {
  sku: string; name: string; category: string; type: 'SIMPLE' | 'RECIPE' | 'SERVICE';
  price: number; cost?: number; recipe?: { sku: string; qty: number; unit: string }[];
}

const PRODUCTS: ProductSeed[] = [
  { sku: 'P-TUSK', name: 'Tusker Lager', category: 'Beer', type: 'SIMPLE', price: 250, recipe: [{ sku: 'BEER-TUSK', qty: 1, unit: 'bottle' }] },
  { sku: 'P-GUIN', name: 'Guinness', category: 'Beer', type: 'SIMPLE', price: 300, recipe: [{ sku: 'BEER-GUIN', qty: 1, unit: 'bottle' }] },
  { sku: 'P-WHITE', name: 'White Cap', category: 'Beer', type: 'SIMPLE', price: 260, recipe: [{ sku: 'BEER-WHITE', qty: 1, unit: 'bottle' }] },
  { sku: 'P-COKE', name: 'Coca-Cola', category: 'Soft Drinks', type: 'SIMPLE', price: 120, recipe: [{ sku: 'SOFT-COKE', qty: 1, unit: 'bottle' }] },
  { sku: 'P-SODA', name: 'Soda Water', category: 'Soft Drinks', type: 'SIMPLE', price: 100, recipe: [{ sku: 'SOFT-SODA', qty: 1, unit: 'bottle' }] },
  { sku: 'P-GT', name: 'Gin & Tonic', category: 'Cocktails', type: 'RECIPE', price: 450, recipe: [{ sku: 'SPIR-GIN', qty: 45, unit: 'ml' }, { sku: 'MIX-TONIC', qty: 1, unit: 'bottle' }, { sku: 'GARN-LIME', qty: 0.25, unit: 'piece' }, { sku: 'GARN-ICE', qty: 0.1, unit: 'kg' }] },
  { sku: 'P-VT', name: 'Vodka Tonic', category: 'Cocktails', type: 'RECIPE', price: 450, recipe: [{ sku: 'SPIR-VOD', qty: 45, unit: 'ml' }, { sku: 'MIX-TONIC', qty: 1, unit: 'bottle' }, { sku: 'GARN-LIME', qty: 0.25, unit: 'piece' }, { sku: 'GARN-ICE', qty: 0.1, unit: 'kg' }] },
  { sku: 'P-MART', name: 'Gin Martini', category: 'Cocktails', type: 'RECIPE', price: 600, recipe: [{ sku: 'SPIR-GIN', qty: 75, unit: 'ml' }, { sku: 'GARN-ICE', qty: 0.1, unit: 'kg' }] },
  { sku: 'P-WHIS', name: 'Whisky (single)', category: 'Spirits', type: 'RECIPE', price: 400, recipe: [{ sku: 'SPIR-WHIS', qty: 45, unit: 'ml' }, { sku: 'GARN-ICE', qty: 0.05, unit: 'kg' }] },
  { sku: 'P-WHISD', name: 'Whisky (double)', category: 'Spirits', type: 'RECIPE', price: 720, recipe: [{ sku: 'SPIR-WHIS', qty: 90, unit: 'ml' }, { sku: 'GARN-ICE', qty: 0.08, unit: 'kg' }] },
  { sku: 'P-REDG', name: 'Red Wine (glass)', category: 'Wine', type: 'RECIPE', price: 350, recipe: [{ sku: 'WINE-RED', qty: 150, unit: 'ml' }] },
  { sku: 'P-WHTG', name: 'White Wine (glass)', category: 'Wine', type: 'RECIPE', price: 350, recipe: [{ sku: 'WINE-WHT', qty: 150, unit: 'ml' }] },
  { sku: 'P-REDB', name: 'Red Wine (bottle)', category: 'Wine', type: 'RECIPE', price: 1800, recipe: [{ sku: 'WINE-RED', qty: 750, unit: 'ml' }] },
  { sku: 'P-COGN', name: 'Vintage Cognac', category: 'Spirits', type: 'RECIPE', price: 950, cost: 160, recipe: [{ sku: 'SPIR-OLD', qty: 50, unit: 'ml' }] },
  { sku: 'P-FRIES', name: 'Loaded Fries', category: 'Food', type: 'SERVICE', price: 350, cost: 130 },
  { sku: 'P-WINGS', name: 'Buffalo Wings', category: 'Food', type: 'SERVICE', price: 650, cost: 280 },
  { sku: 'P-NYAMA', name: 'Nyama Choma (0.5kg)', category: 'Food', type: 'SERVICE', price: 900, cost: 420 },
  { sku: 'P-SAMB', name: 'Samosa (2pc)', category: 'Food', type: 'SERVICE', price: 200, cost: 70 },
  { sku: 'P-WATER', name: 'Bottled Water', category: 'Soft Drinks', type: 'SIMPLE', price: 80, cost: 30 },
  { sku: 'P-SHOT', name: 'Tequila Shot', category: 'Spirits', type: 'RECIPE', price: 300, cost: 90, recipe: [{ sku: 'SPIR-VOD', qty: 30, unit: 'ml' }] },
];

async function main() {
  console.log('Resetting…');
  await reset();

  console.log('Access control…');
  const roleByName = await seedAccessControl();
  await seedUsers(roleByName);
  const storekeeper = await prisma.user.findFirstOrThrow({ where: { username: 'storekeeper1' } });
  const cashier = await prisma.user.findFirstOrThrow({ where: { username: 'cashier1' } });

  console.log('Suppliers & stock…');
  const supplierByName = new Map<string, number>();
  for (const s of SUPPLIERS) {
    const created = await prisma.supplier.create({ data: { name: s.name, leadTimeDays: s.leadTimeDays, paymentTerms: s.paymentTerms, phone: `+2547${between(10000000, 99999999)}` } });
    supplierByName.set(s.name, created.id);
  }
  const stockBySku = new Map<string, { id: number; cost: number }>();
  for (const s of STOCK) {
    const item = await prisma.stockItem.create({
      data: { sku: s.sku, name: s.name, category: s.category, unit: s.unit, costPrice: s.cost, reorderPoint: s.reorder, parLevel: s.par, currentStock: s.current, supplierId: supplierByName.get(s.supplier) },
    });
    stockBySku.set(s.sku, { id: item.id, cost: s.cost });
    // Opening balance as an auditable movement.
    await prisma.stockMovement.create({ data: { stockItemId: item.id, movementType: 'PURCHASE_RECEIVED', quantity: s.current, unitCost: s.cost, totalCost: s.current * s.cost, referenceType: 'opening_balance', userId: storekeeper.id, notes: 'Opening balance' } });
  }

  console.log('Menu & recipes…');
  const catByName = new Map<string, number>();
  for (const name of ['Beer', 'Wine', 'Spirits', 'Cocktails', 'Soft Drinks', 'Food', 'Mixers', 'Garnish']) {
    const c = await prisma.productCategory.create({ data: { name } });
    catByName.set(name, c.id);
  }
  const productBySku = new Map<string, { id: number; price: number; cost: number; taxable: boolean }>();
  for (const p of PRODUCTS) {
    const recipeCost = p.recipe ? p.recipe.reduce((sum, r) => sum + r.qty * (stockBySku.get(r.sku)?.cost ?? 0), 0) : (p.cost ?? 0);
    const product = await prisma.product.create({
      data: { sku: p.sku, name: p.name, categoryId: catByName.get(p.category)!, productType: p.type, sellingPrice: p.price, costPrice: recipeCost, taxable: p.category !== 'Food' ? true : true },
    });
    if (p.recipe) {
      await prisma.productIngredient.createMany({ data: p.recipe.map((r) => ({ productId: product.id, stockItemId: stockBySku.get(r.sku)!.id, quantity: r.qty, unit: r.unit })) });
    }
    productBySku.set(p.sku, { id: product.id, price: p.price, cost: Number(recipeCost.toFixed?.(4) ?? recipeCost), taxable: true });
  }

  console.log('Tables & customers…');
  const tables = await Promise.all(
    [['T1', 'Main Bar'], ['T2', 'Main Bar'], ['T3', 'Terrace'], ['T4', 'Terrace'], ['VIP1', 'VIP Lounge']].map(([name, area]) =>
      prisma.table.create({ data: { name: name!, area } }),
    ),
  );
  const customers = await Promise.all(
    [['James Otieno', '+254711111111'], ['Aisha Mohammed', '+254722222222'], ['Peter Kariuki', '+254733333333']].map(([name, phone]) =>
      prisma.customer.create({ data: { name: name!, phone } }),
    ),
  );

  console.log('Sales history (this is the slow part)…');
  const taxRate = 0.16;
  // Bias volume toward beers & popular cocktails so ABC/top-sellers look real.
  const weighted = [
    ...Array(8).fill('P-TUSK'), ...Array(5).fill('P-WHITE'), ...Array(2).fill('P-GUIN'),
    ...Array(5).fill('P-GT'), ...Array(4).fill('P-VT'), ...Array(3).fill('P-WHIS'),
    ...Array(3).fill('P-REDG'), ...Array(3).fill('P-WINGS'), ...Array(2).fill('P-FRIES'),
    ...Array(2).fill('P-COKE'), ...Array(2).fill('P-NYAMA'), 'P-MART', 'P-SHOT', 'P-WHTG', 'P-COGN',
  ];

  // Precompute each product's stock draw from the seed recipes — no per-line
  // DB round-trip, and no long-running interactive transactions (which time out
  // over a remote pooled connection).
  const recipeByProduct = new Map<number, { stockItemId: number; qty: number }[]>();
  for (const p of PRODUCTS) {
    if (!p.recipe) continue;
    recipeByProduct.set(productBySku.get(p.sku)!.id, p.recipe.map((r) => ({ stockItemId: stockBySku.get(r.sku)!.id, qty: r.qty })));
  }

  const stockDelta = new Map<number, Prisma.Decimal>();
  const movements: Prisma.StockMovementCreateManyInput[] = [];

  for (let day = 21; day >= 0; day--) {
    const salesToday = between(3, 8);
    for (let s = 0; s < salesToday; s++) {
      const when = new Date(Date.now() - day * 864e5 - between(0, 8) * 36e5);
      const lineCount = between(1, 4);
      let subtotal = new Prisma.Decimal(0);
      let taxable = new Prisma.Decimal(0);
      const lines: { productId: number; qty: number; price: number; cost: number; lineTotal: Prisma.Decimal }[] = [];
      for (let l = 0; l < lineCount; l++) {
        const prod = productBySku.get(pick(weighted))!;
        const q = between(1, 3);
        const lineTotal = new Prisma.Decimal(prod.price).times(q);
        subtotal = subtotal.plus(lineTotal);
        taxable = taxable.plus(lineTotal);
        lines.push({ productId: prod.id, qty: q, price: prod.price, cost: prod.cost, lineTotal });
      }
      const tax = taxable.times(taxRate).toDecimalPlaces(4);
      const total = subtotal.plus(tax);

      const sale = await retry(() => prisma.sale.create({
        data: {
          userId: cashier.id,
          customerId: rand() < 0.3 ? pick(customers).id : null,
          saleTime: when,
          subtotal,
          taxAmount: tax,
          totalAmount: total,
          status: 'COMPLETED',
          items: { create: lines.map((l) => ({ productId: l.productId, quantity: l.qty, unitPrice: l.price, lineTotal: l.lineTotal, costAtSale: l.cost })) },
          payments: { create: [{ userId: cashier.id, method: rand() < 0.6 ? 'CASH' : 'MOBILE_MONEY', amount: total, paidAt: when }] },
        },
      }));

      for (const l of lines) {
        for (const ing of recipeByProduct.get(l.productId) ?? []) {
          const q = new Prisma.Decimal(ing.qty).times(l.qty).negated();
          movements.push({ stockItemId: ing.stockItemId, movementType: 'SALE', quantity: q, referenceType: 'sale', referenceId: sale.id, userId: cashier.id, createdAt: when });
          stockDelta.set(ing.stockItemId, (stockDelta.get(ing.stockItemId) ?? new Prisma.Decimal(0)).plus(q));
        }
      }
    }
  }

  // Flush the ledger in chunks, then apply each item's net change once.
  for (let i = 0; i < movements.length; i += 300) {
    const chunk = movements.slice(i, i + 300);
    await retry(() => prisma.stockMovement.createMany({ data: chunk }));
  }
  for (const [stockItemId, delta] of stockDelta) {
    await retry(() => prisma.stockItem.update({ where: { id: stockItemId }, data: { currentStock: { increment: delta } } }));
  }

  // A little wastage and an open PO so those reports aren't empty.
  const guin = stockBySku.get('BEER-GUIN')!;
  await retry(() => prisma.$transaction(async (tx) => {
    const w = await tx.wastage.create({ data: { stockItemId: guin.id, quantity: 3, reason: 'Breakage — dropped crate', userId: storekeeper.id } });
    await tx.stockMovement.create({ data: { stockItemId: guin.id, movementType: 'BREAKAGE', quantity: -3, referenceType: 'wastage', referenceId: w.id, userId: storekeeper.id } });
    await tx.stockItem.update({ where: { id: guin.id }, data: { currentStock: { decrement: 3 } } });
  }));
  await retry(() => prisma.purchaseOrder.create({
    data: {
      supplierId: supplierByName.get('EABL Distributors')!,
      status: 'ORDERED',
      createdById: storekeeper.id,
      expectedDate: new Date(Date.now() + 2 * 864e5),
      totalAmount: 150 * 96,
      items: { create: [{ stockItemId: guin.id, quantity: 96, unitCost: 150, lineTotal: 150 * 96 }] },
    },
  }));

  const counts = await prisma.$transaction([prisma.user.count(), prisma.product.count(), prisma.sale.count(), prisma.stockItem.count()]);
  console.log(`Done. users=${counts[0]} products=${counts[1]} sales=${counts[2]} stockItems=${counts[3]}`);
  console.log('Login with  owner1 / password123   (PIN 1234). Every role has <role>1 and <role>2.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
