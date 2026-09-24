-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY');

-- CreateEnum
CREATE TYPE "TabStatus" AS ENUM ('OPEN', 'CLOSED', 'MERGED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('OPEN', 'COMPLETED', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY', 'VOUCHER', 'ROOM_CHARGE', 'CREDIT');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SIMPLE', 'RECIPE', 'SERVICE');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE_RECEIVED', 'SALE', 'TRANSFER', 'WASTAGE', 'BREAKAGE', 'COMPLIMENTARY', 'STAFF_DRINK', 'COUNT_ADJUSTMENT', 'SUPPLIER_RETURN');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('FLOAT_IN', 'CASH_DROP', 'PETTY_CASH', 'PAYOUT', 'SAFE_DROP');

-- CreateTable
CREATE TABLE "roles" (
    "role_id" SERIAL NOT NULL,
    "role_name" TEXT NOT NULL,
    "description" TEXT,
    "landing_path" TEXT NOT NULL DEFAULT '/dashboard',

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "permission_id" SERIAL NOT NULL,
    "permission_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "customer_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "loyalty_points" INTEGER NOT NULL DEFAULT 0,
    "credit_balance" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "tables" (
    "table_id" SERIAL NOT NULL,
    "table_name" TEXT NOT NULL,
    "area" TEXT,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "tables_pkey" PRIMARY KEY ("table_id")
);

-- CreateTable
CREATE TABLE "tabs" (
    "tab_id" SERIAL NOT NULL,
    "table_id" INTEGER,
    "customer_id" INTEGER,
    "opened_by" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "status" "TabStatus" NOT NULL DEFAULT 'OPEN',
    "total_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "tabs_pkey" PRIMARY KEY ("tab_id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "shift_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "opening_float" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "closing_cash" DECIMAL(14,4),
    "variance" DECIMAL(14,4),
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("shift_id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "cash_movement_id" SERIAL NOT NULL,
    "shift_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("cash_movement_id")
);

-- CreateTable
CREATE TABLE "sales" (
    "sale_id" SERIAL NOT NULL,
    "tab_id" INTEGER,
    "shift_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "sale_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "status" "SaleStatus" NOT NULL DEFAULT 'OPEN',
    "void_reason" TEXT,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("sale_id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "sale_item_id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "discount_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,4) NOT NULL,
    "cost_at_sale" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("sale_item_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "payment_id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "shift_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "reference" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "category_id" SERIAL NOT NULL,
    "parent_id" INTEGER,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_type" "ProductType" NOT NULL DEFAULT 'SIMPLE',
    "selling_price" DECIMAL(14,4) NOT NULL,
    "cost_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_ingredients" (
    "product_id" INTEGER NOT NULL,
    "stock_item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "product_ingredients_pkey" PRIMARY KEY ("product_id","stock_item_id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "supplier_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "payment_terms" TEXT,
    "lead_time_days" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("supplier_id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "stock_item_id" SERIAL NOT NULL,
    "supplier_id" INTEGER,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "cost_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "par_level" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "current_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("stock_item_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "movement_id" SERIAL NOT NULL,
    "stock_item_id" INTEGER NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reference_type" TEXT,
    "reference_id" INTEGER,
    "user_id" INTEGER,
    "shift_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("movement_id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "po_id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" TIMESTAMP(3),
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("po_id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "po_item_id" SERIAL NOT NULL,
    "po_id" INTEGER NOT NULL,
    "stock_item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "line_total" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("po_item_id")
);

-- CreateTable
CREATE TABLE "goods_received" (
    "grn_id" SERIAL NOT NULL,
    "po_id" INTEGER,
    "supplier_id" INTEGER NOT NULL,
    "received_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" INTEGER NOT NULL,
    "invoice_no" TEXT,
    "total_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "goods_received_pkey" PRIMARY KEY ("grn_id")
);

-- CreateTable
CREATE TABLE "goods_received_items" (
    "grn_item_id" SERIAL NOT NULL,
    "grn_id" INTEGER NOT NULL,
    "stock_item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "batch_no" TEXT,

    CONSTRAINT "goods_received_items_pkey" PRIMARY KEY ("grn_item_id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "count_id" SERIAL NOT NULL,
    "count_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("count_id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "count_item_id" SERIAL NOT NULL,
    "count_id" INTEGER NOT NULL,
    "stock_item_id" INTEGER NOT NULL,
    "theoretical_qty" DECIMAL(14,4) NOT NULL,
    "actual_qty" DECIMAL(14,4) NOT NULL,
    "variance" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("count_item_id")
);

-- CreateTable
CREATE TABLE "wastage" (
    "wastage_id" SERIAL NOT NULL,
    "stock_item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "shift_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wastage_pkey" PRIMARY KEY ("wastage_id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "expense_id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,4) NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    "shift_id" INTEGER,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("expense_id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "loyalty_id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "sale_id" INTEGER,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "points_redeemed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("loyalty_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_name_key" ON "roles"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_permission_name_key" ON "permissions"("permission_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "tabs_status_idx" ON "tabs"("status");

-- CreateIndex
CREATE INDEX "shifts_user_id_status_idx" ON "shifts"("user_id", "status");

-- CreateIndex
CREATE INDEX "cash_movements_shift_id_idx" ON "cash_movements"("shift_id");

-- CreateIndex
CREATE INDEX "sales_sale_time_idx" ON "sales"("sale_time");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_sku_key" ON "stock_items"("sku");

-- CreateIndex
CREATE INDEX "stock_movements_stock_item_id_idx" ON "stock_movements"("stock_item_id");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("permission_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("table_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "tabs"("tab_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("sale_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("sale_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ingredients" ADD CONSTRAINT "product_ingredients_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("stock_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("stock_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("po_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("stock_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received" ADD CONSTRAINT "goods_received_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("po_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received" ADD CONSTRAINT "goods_received_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received" ADD CONSTRAINT "goods_received_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_items" ADD CONSTRAINT "goods_received_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_received"("grn_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_items" ADD CONSTRAINT "goods_received_items_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("stock_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("count_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("stock_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("stock_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("sale_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

