import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError, idParam, wrap } from '../lib/http';
import { serialize } from '../lib/serialize';
import { auditFromReq } from '../lib/audit';
import { recomputeProductCost } from '../lib/inventory';
import { grossMarginPct, grossProfit, pourCostPct } from '../domain/costing';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);

// ---- Categories --------------------------------------------------------------

router.get(
  '/product-categories',
  requirePermission('products.view'),
  wrap(async (_req, res) => {
    const categories = await prisma.productCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    res.json(serialize(categories));
  }),
);

const categorySchema = z.object({
  name: z.string().min(1),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.post(
  '/product-categories',
  requirePermission('products.manage'),
  wrap(async (req, res) => {
    const data = categorySchema.parse(req.body);
    const category = await prisma.productCategory.create({ data });
    await auditFromReq(req, { action: 'category.create', entity: 'ProductCategory', entityId: category.id, newValue: category });
    res.status(201).json(serialize(category));
  }),
);

// ---- Products ----------------------------------------------------------------

/** Attach the derived margins so the menu grid never recomputes them client-side. */
function withMargins<T extends { sellingPrice: unknown; costPrice: unknown }>(p: T) {
  const price = p.sellingPrice as never;
  const cost = p.costPrice as never;
  return {
    ...serialize(p) as object,
    grossProfit: grossProfit(price, cost).toNumber(),
    grossMarginPct: grossMarginPct(price, cost).toNumber(),
    pourCostPct: pourCostPct(price, cost).toNumber(),
  };
}

router.get(
  '/products',
  requirePermission('products.view'),
  wrap(async (req, res) => {
    const { categoryId, search, active } = req.query;
    const products = await prisma.product.findMany({
      where: {
        categoryId: categoryId ? Number(categoryId) : undefined,
        isActive: active === undefined ? undefined : active === 'true',
        OR: search
          ? [
              { name: { contains: String(search), mode: 'insensitive' } },
              { sku: { contains: String(search), mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    res.json(products.map(withMargins));
  }),
);

router.get(
  '/products/:id',
  requirePermission('products.view'),
  wrap(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: idParam(req) },
      include: { category: true, ingredients: { include: { stockItem: true } } },
    });
    if (!product) throw ApiError.notFound('Product not found');
    res.json(withMargins(product));
  }),
);

const productSchema = z.object({
  categoryId: z.number().int().positive(),
  sku: z.string().min(1),
  name: z.string().min(1),
  productType: z.enum(['SIMPLE', 'RECIPE', 'SERVICE']).optional(),
  sellingPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative().optional(),
  taxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.post(
  '/products',
  requirePermission('products.manage'),
  wrap(async (req, res) => {
    const data = productSchema.parse(req.body);
    const product = await prisma.product.create({ data });
    await auditFromReq(req, { action: 'product.create', entity: 'Product', entityId: product.id, newValue: product });
    res.status(201).json(withMargins({ ...product }));
  }),
);

router.patch(
  '/products/:id',
  requirePermission('products.manage'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const data = productSchema.partial().parse(req.body);
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('Product not found');
    const product = await prisma.product.update({ where: { id }, data });
    await auditFromReq(req, { action: 'product.update', entity: 'Product', entityId: id, oldValue: before, newValue: product });
    res.json(withMargins(product));
  }),
);

router.delete(
  '/products/:id',
  requirePermission('products.manage'),
  wrap(async (req, res) => {
    const id = idParam(req);
    // Soft delete — products are referenced by historical sale_items.
    const product = await prisma.product.update({ where: { id }, data: { isActive: false } });
    await auditFromReq(req, { action: 'product.deactivate', entity: 'Product', entityId: id });
    res.json(serialize(product));
  }),
);

// ---- Recipe / bill of materials ---------------------------------------------

const recipeSchema = z.object({
  ingredients: z.array(
    z.object({
      stockItemId: z.number().int().positive(),
      quantity: z.number().positive(),
      unit: z.string().min(1),
    }),
  ),
});

router.put(
  '/products/:id/recipe',
  requirePermission('products.manage'),
  wrap(async (req, res) => {
    const id = idParam(req);
    const { ingredients } = recipeSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      await tx.productIngredient.deleteMany({ where: { productId: id } });
      if (ingredients.length > 0) {
        await tx.productIngredient.createMany({
          data: ingredients.map((i) => ({ productId: id, ...i })),
        });
      }
      const cost = await recomputeProductCost(tx, id);
      return tx.product.findUniqueOrThrow({
        where: { id },
        include: { ingredients: { include: { stockItem: true } } },
      }).then((p) => ({ product: p, cost }));
    });

    await auditFromReq(req, { action: 'product.recipe.update', entity: 'Product', entityId: id, newValue: { ingredients } });
    res.json(withMargins(result.product));
  }),
);

export default router;
