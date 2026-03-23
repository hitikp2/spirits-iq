// scripts/seed.mjs — Standalone seed script for Railway startup
// Called after prisma migrate deploy, before starting the app
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  // Check if already seeded
  const existingStore = await db.store.findUnique({ where: { id: "demo-store" } });
  if (existingStore) {
    console.log("Database already seeded, skipping.");
    return;
  }

  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("demo1234", 12);

  const store = await db.store.create({
    data: {
      id: "demo-store",
      name: "Highland Spirits",
      slug: "highland-spirits",
      address: "8421 Sunset Blvd",
      city: "Los Angeles",
      state: "CA",
      zip: "90069",
      phone: "+13105550100",
      email: "hello@highlandspirits.com",
      timezone: "America/Los_Angeles",
      taxRate: 0.0975,
      licenseNumber: "CA-LIQ-2024-48291",
      operatingHours: {
        mon: { open: "10:00", close: "22:00" },
        tue: { open: "10:00", close: "22:00" },
        wed: { open: "10:00", close: "22:00" },
        thu: { open: "10:00", close: "22:00" },
        fri: { open: "10:00", close: "23:00" },
        sat: { open: "09:00", close: "23:00" },
        sun: { open: "11:00", close: "21:00" },
      },
      settings: {
        aiSmsAutoResponse: true,
        aiPricingSuggestions: true,
        aiDemandForecasting: true,
        ecommerce: false,
        delivery: false,
      },
    },
  });

  await Promise.all([
    db.user.create({ data: { email: "owner@highlandspirits.com", name: "Alex Rivera", passwordHash, role: "OWNER", pin: "1234", storeId: store.id } }),
    db.user.create({ data: { email: "manager@highlandspirits.com", name: "Jordan Chen", passwordHash, role: "MANAGER", pin: "5678", storeId: store.id } }),
    db.user.create({ data: { email: "cashier@highlandspirits.com", name: "Sam Torres", passwordHash, role: "CASHIER", pin: "0000", storeId: store.id } }),
  ]);

  await db.register.create({
    data: { name: "Register 1", storeId: store.id, isActive: true },
  });

  const categories = await Promise.all(
    [
      { name: "Bourbon", slug: "bourbon", icon: "🥃", sortOrder: 1 },
      { name: "Tequila", slug: "tequila", icon: "🌵", sortOrder: 2 },
      { name: "Scotch", slug: "scotch", icon: "🏴\u200d", sortOrder: 3 },
      { name: "Vodka", slug: "vodka", icon: "🧊", sortOrder: 4 },
      { name: "Gin", slug: "gin", icon: "🫒", sortOrder: 5 },
      { name: "Wine", slug: "wine", icon: "🍷", sortOrder: 6 },
      { name: "Champagne", slug: "champagne", icon: "🍾", sortOrder: 7 },
      { name: "Beer", slug: "beer", icon: "🍺", sortOrder: 8 },
      { name: "Seltzer", slug: "seltzer", icon: "🥤", sortOrder: 9 },
      { name: "Mixers", slug: "mixers", icon: "🧃", sortOrder: 10 },
    ].map((c) => db.category.create({ data: { ...c, storeId: store.id } }))
  );

  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const suppliers = await Promise.all([
    db.supplier.create({ data: { name: "SoCal Spirits Dist.", contactName: "Maria Lopez", email: "orders@socalspirits.com", phone: "+13105551200", leadTimeDays: 2, storeId: store.id } }),
    db.supplier.create({ data: { name: "Pacific Wine Merchants", contactName: "David Park", email: "sales@pacificwine.com", phone: "+13105551300", leadTimeDays: 3, storeId: store.id } }),
    db.supplier.create({ data: { name: "West Coast Beverage Co.", contactName: "Tom Ellis", email: "orders@wcbev.com", phone: "+13105551400", leadTimeDays: 4, storeId: store.id } }),
  ]);

  const products = [
    { sku: "BT-001", name: "Buffalo Trace", brand: "Buffalo Trace", categoryId: catMap.bourbon, costPrice: 19.5, retailPrice: 29.99, quantity: 48, size: "750ml", abv: 45.0, reorderPoint: 12, supplierId: suppliers[0].id, tags: ["staff-pick", "best-seller"] },
    { sku: "ET-001", name: "EH Taylor Small Batch", brand: "EH Taylor", categoryId: catMap.bourbon, costPrice: 28.0, retailPrice: 41.99, quantity: 12, size: "750ml", abv: 50.0, reorderPoint: 4, supplierId: suppliers[0].id, tags: ["premium"] },
    { sku: "BL-001", name: "Blanton's Single Barrel", brand: "Blanton's", categoryId: catMap.bourbon, costPrice: 42.0, retailPrice: 64.99, quantity: 0, size: "750ml", abv: 46.5, reorderPoint: 3, supplierId: suppliers[0].id, tags: ["allocated", "premium"] },
    { sku: "CM-001", name: "Casamigos Reposado", brand: "Casamigos", categoryId: catMap.tequila, costPrice: 28.0, retailPrice: 44.99, quantity: 24, size: "750ml", abv: 40.0, reorderPoint: 8, supplierId: suppliers[0].id, tags: ["popular"] },
    { sku: "DJ-001", name: "Don Julio 1942", brand: "Don Julio", categoryId: catMap.tequila, costPrice: 105.0, retailPrice: 164.99, quantity: 3, size: "750ml", abv: 40.0, reorderPoint: 6, supplierId: suppliers[0].id, tags: ["premium", "top-shelf"] },
    { sku: "CZ-001", name: "Clase Azul Plata", brand: "Clase Azul", categoryId: catMap.tequila, costPrice: 78.0, retailPrice: 127.99, quantity: 8, size: "750ml", abv: 40.0, reorderPoint: 4, supplierId: suppliers[0].id, tags: ["premium", "luxury"] },
    { sku: "JW-001", name: "Johnnie Walker Blue", brand: "Johnnie Walker", categoryId: catMap.scotch, costPrice: 155.0, retailPrice: 229.99, quantity: 5, size: "750ml", abv: 40.0, reorderPoint: 2, supplierId: suppliers[0].id, tags: ["premium", "luxury"] },
    { sku: "GG-001", name: "Grey Goose", brand: "Grey Goose", categoryId: catMap.vodka, costPrice: 22.0, retailPrice: 34.99, quantity: 36, size: "750ml", abv: 40.0, reorderPoint: 10, supplierId: suppliers[2].id, tags: ["popular"] },
    { sku: "GG-002", name: "Grey Goose 1.75L", brand: "Grey Goose", categoryId: catMap.vodka, costPrice: 31.0, retailPrice: 49.99, quantity: 4, size: "1.75L", abv: 40.0, reorderPoint: 10, supplierId: suppliers[2].id, tags: ["popular"] },
    { sku: "HG-001", name: "Hendrick's Gin", brand: "Hendrick's", categoryId: catMap.gin, costPrice: 22.0, retailPrice: 34.99, quantity: 31, size: "750ml", abv: 44.0, reorderPoint: 10, supplierId: suppliers[0].id, tags: ["popular", "staff-pick"] },
    { sku: "WA-001", name: "Whispering Angel Rosé", brand: "Caves d'Esclans", categoryId: catMap.wine, costPrice: 12.0, retailPrice: 19.99, quantity: 42, size: "750ml", abv: 13.0, reorderPoint: 15, supplierId: suppliers[1].id, tags: ["best-seller"], vintage: 2023 },
    { sku: "OP-001", name: "Opus One 2019", brand: "Opus One", categoryId: catMap.wine, costPrice: 280.0, retailPrice: 399.99, quantity: 2, size: "750ml", abv: 14.5, reorderPoint: 2, supplierId: suppliers[1].id, tags: ["premium", "luxury", "allocated"], vintage: 2019 },
    { sku: "VC-001", name: "Veuve Clicquot", brand: "Veuve Clicquot", categoryId: catMap.champagne, costPrice: 38.0, retailPrice: 55.99, quantity: 22, size: "750ml", abv: 12.0, reorderPoint: 8, supplierId: suppliers[1].id, tags: ["popular"] },
    { sku: "MC-001", name: "Moët & Chandon Imperial", brand: "Moët", categoryId: catMap.champagne, costPrice: 33.0, retailPrice: 49.99, quantity: 18, size: "750ml", abv: 12.0, reorderPoint: 8, supplierId: suppliers[1].id, tags: ["popular"] },
    { sku: "MD-001", name: "Modelo Especial 12pk", brand: "Modelo", categoryId: catMap.beer, costPrice: 12.0, retailPrice: 17.99, quantity: 60, size: "12-pack", abv: 4.4, reorderPoint: 24, supplierId: suppliers[2].id, tags: ["best-seller"] },
    { sku: "WC-001", name: "White Claw Variety 12pk", brand: "White Claw", categoryId: catMap.seltzer, costPrice: 13.0, retailPrice: 18.99, quantity: 48, size: "12-pack", abv: 5.0, reorderPoint: 20, supplierId: suppliers[2].id, tags: ["popular"] },
    { sku: "FT-001", name: "Fever Tree Ginger Beer 4pk", brand: "Fever Tree", categoryId: catMap.mixers, costPrice: 4.5, retailPrice: 7.99, quantity: 30, size: "4-pack", abv: 0, reorderPoint: 12, supplierId: suppliers[2].id, tags: [], isAgeRestricted: false },
  ];

  for (const p of products) {
    const margin = p.retailPrice > 0 ? ((p.retailPrice - p.costPrice) / p.retailPrice) * 100 : 0;
    await db.product.create({
      data: { ...p, storeId: store.id, margin, isActive: true, isAgeRestricted: p.isAgeRestricted ?? true },
    });
  }

  await Promise.all([
    db.customer.create({ data: { phone: "+13105550142", firstName: "Mike", lastName: "R.", storeId: store.id, tier: "VIP", tags: ["bourbon-lover", "vip"], loyaltyPoints: 2480, totalSpent: 4250.00, visitCount: 38, smsOptedIn: true, smsOptInDate: new Date("2024-01-15") } }),
    db.customer.create({ data: { phone: "+13105550298", firstName: "Sarah", lastName: "L.", storeId: store.id, tier: "WINE_CLUB", tags: ["wine-club", "red-wine"], loyaltyPoints: 1820, totalSpent: 3100.00, visitCount: 26, smsOptedIn: true, smsOptInDate: new Date("2024-02-20") } }),
    db.customer.create({ data: { phone: "+13105550417", firstName: "David", lastName: "K.", storeId: store.id, tier: "REGULAR", tags: ["tequila"], loyaltyPoints: 640, totalSpent: 890.00, visitCount: 12, smsOptedIn: true, smsOptInDate: new Date("2024-06-10") } }),
  ]);

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
