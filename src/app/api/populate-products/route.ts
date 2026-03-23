export const dynamic = "force-dynamic";

import { db } from "@/lib/db";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const storeId = (body as any)?.storeId || request.headers.get("x-store-id");
  if (!storeId) {
    return Response.json({ error: "storeId is required (pass in body or x-store-id header)" }, { status: 400 });
  }

  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) {
    return Response.json({ error: "Store not found. Run seed first." }, { status: 404 });
  }

  // Ensure all needed categories exist
  const categoryDefs = [
    { name: "Bourbon", slug: "bourbon", icon: "🥃", sortOrder: 1 },
    { name: "Rye Whiskey", slug: "rye-whiskey", icon: "🥃", sortOrder: 11 },
    { name: "Wheat Whiskey", slug: "wheat-whiskey", icon: "🥃", sortOrder: 12 },
    { name: "Irish Whiskey", slug: "irish-whiskey", icon: "☘️", sortOrder: 13 },
    { name: "Scotch", slug: "scotch", icon: "🏴", sortOrder: 3 },
    { name: "Tequila", slug: "tequila", icon: "🌵", sortOrder: 2 },
    { name: "Vodka", slug: "vodka", icon: "🧊", sortOrder: 4 },
    { name: "Cognac", slug: "cognac", icon: "🍇", sortOrder: 14 },
  ];

  const catMap: Record<string, string> = {};
  for (const c of categoryDefs) {
    const existing = await db.category.findUnique({
      where: { storeId_slug: { storeId, slug: c.slug } },
    });
    if (existing) {
      catMap[c.slug] = existing.id;
    } else {
      const created = await db.category.create({ data: { ...c, storeId } });
      catMap[c.slug] = created.id;
    }
  }

  const suppliers = await db.supplier.findMany({ where: { storeId } });
  const defaultSupplierId = suppliers[0]?.id ?? null;

  const catSlugMap: Record<string, string> = {
    "Bourbon": "bourbon",
    "Rye Whiskey": "rye-whiskey",
    "Wheat Whiskey": "wheat-whiskey",
    "Irish Whiskey": "irish-whiskey",
    "Scotch": "scotch",
    "Tequila": "tequila",
    "Vodka": "vodka",
    "Cognac": "cognac",
  };

  const products = [
    { sku: "JM-RYE-001", name: "Journeyman Not A King Rye", brand: "Journeyman", category: "Rye Whiskey", size: "750ml", abv: 45.0, retailPrice: 29.99, costPrice: 18.00, quantity: 18, tags: ["craft"] },
    { sku: "FB-BRB-001", name: "Featherbone Bourbon", brand: "Journeyman", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 34.99, costPrice: 21.00, quantity: 12, tags: ["craft"] },
    { sku: "BW-WHT-001", name: "Buggy Whip Wheat Whiskey", brand: "Journeyman", category: "Wheat Whiskey", size: "750ml", abv: 45.0, retailPrice: 34.99, costPrice: 21.00, quantity: 12, tags: ["craft"] },
    { sku: "BT-002", name: "Buffalo Trace Bourbon", brand: "Buffalo Trace", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 29.99, costPrice: 19.50, quantity: 48, tags: ["best-seller", "staff-pick"] },
    { sku: "WL-SR-001", name: "Weller Special Reserve", brand: "Weller", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 29.99, costPrice: 18.00, quantity: 12, tags: ["allocated"] },
    { sku: "WL-FP-001", name: "Weller Full Proof", brand: "Weller", category: "Bourbon", size: "750ml", abv: 57.0, retailPrice: 49.99, costPrice: 30.00, quantity: 4, tags: ["allocated", "premium"] },
    { sku: "BL-002", name: "Blanton's Single Barrel", brand: "Blanton's", category: "Bourbon", size: "750ml", abv: 46.5, retailPrice: 64.99, costPrice: 42.00, quantity: 3, tags: ["allocated", "premium"] },
    { sku: "ER-001", name: "Eagle Rare 10 Year", brand: "Eagle Rare", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 39.99, costPrice: 24.00, quantity: 8, tags: ["allocated"] },
    { sku: "SJ-001", name: "Stagg Jr Bourbon", brand: "Stagg Jr", category: "Bourbon", size: "750ml", abv: 65.0, retailPrice: 54.99, costPrice: 35.00, quantity: 2, tags: ["allocated", "premium", "barrel-proof"] },
    { sku: "EC-BP-001", name: "Elijah Craig Barrel Proof", brand: "Elijah Craig", category: "Bourbon", size: "750ml", abv: 62.5, retailPrice: 64.99, costPrice: 42.00, quantity: 6, tags: ["premium", "barrel-proof"] },
    { sku: "EC-SB-001", name: "Elijah Craig Small Batch", brand: "Elijah Craig", category: "Bourbon", size: "750ml", abv: 47.0, retailPrice: 29.99, costPrice: 18.00, quantity: 36, tags: ["popular"] },
    { sku: "FR-SB-001", name: "Four Roses Single Barrel", brand: "Four Roses", category: "Bourbon", size: "750ml", abv: 50.0, retailPrice: 44.99, costPrice: 28.00, quantity: 18, tags: ["popular"] },
    { sku: "FR-SM-001", name: "Four Roses Small Batch", brand: "Four Roses", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 34.99, costPrice: 22.00, quantity: 24, tags: ["popular"] },
    { sku: "WT-101-001", name: "Wild Turkey 101", brand: "Wild Turkey", category: "Bourbon", size: "750ml", abv: 50.5, retailPrice: 24.99, costPrice: 15.00, quantity: 42, tags: ["best-seller", "value"] },
    { sku: "RR-10-001", name: "Russell's Reserve 10 Year", brand: "Russell's Reserve", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 39.99, costPrice: 25.00, quantity: 18, tags: ["popular"] },
    { sku: "RR-SB-001", name: "Russell's Reserve Single Barrel", brand: "Russell's Reserve", category: "Bourbon", size: "750ml", abv: 55.0, retailPrice: 59.99, costPrice: 38.00, quantity: 8, tags: ["premium"] },
    { sku: "KC-9-001", name: "Knob Creek 9 Year", brand: "Knob Creek", category: "Bourbon", size: "750ml", abv: 50.0, retailPrice: 36.99, costPrice: 23.00, quantity: 30, tags: ["popular"] },
    { sku: "KC-SB-001", name: "Knob Creek Single Barrel", brand: "Knob Creek", category: "Bourbon", size: "750ml", abv: 60.0, retailPrice: 49.99, costPrice: 32.00, quantity: 12, tags: ["premium", "barrel-proof"] },
    { sku: "MM-001", name: "Maker's Mark", brand: "Maker's Mark", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 29.99, costPrice: 18.00, quantity: 36, tags: ["popular"] },
    { sku: "MM-CS-001", name: "Maker's Mark Cask Strength", brand: "Maker's Mark", category: "Bourbon", size: "750ml", abv: 55.0, retailPrice: 44.99, costPrice: 28.00, quantity: 12, tags: ["premium", "barrel-proof"] },
    { sku: "WR-001", name: "Woodford Reserve", brand: "Woodford Reserve", category: "Bourbon", size: "750ml", abv: 45.2, retailPrice: 36.99, costPrice: 23.00, quantity: 30, tags: ["popular", "staff-pick"] },
    { sku: "OF-1920-001", name: "Old Forester 1920", brand: "Old Forester", category: "Bourbon", size: "750ml", abv: 57.5, retailPrice: 59.99, costPrice: 38.00, quantity: 15, tags: ["premium"] },
    { sku: "OF-1910-001", name: "Old Forester 1910", brand: "Old Forester", category: "Bourbon", size: "750ml", abv: 46.5, retailPrice: 54.99, costPrice: 35.00, quantity: 15, tags: ["premium"] },
    { sku: "HH-BIB-001", name: "Heaven Hill Bottled in Bond", brand: "Heaven Hill", category: "Bourbon", size: "750ml", abv: 50.0, retailPrice: 19.99, costPrice: 12.00, quantity: 30, tags: ["value", "best-seller"] },
    { sku: "LR-BP-001", name: "Larceny Barrel Proof", brand: "Larceny", category: "Bourbon", size: "750ml", abv: 60.0, retailPrice: 49.99, costPrice: 32.00, quantity: 8, tags: ["premium", "barrel-proof"] },
    { sku: "AE-BRB-001", name: "Angel's Envy Bourbon", brand: "Angel's Envy", category: "Bourbon", size: "750ml", abv: 43.3, retailPrice: 49.99, costPrice: 32.00, quantity: 18, tags: ["premium", "popular"] },
    { sku: "BU-BRB-001", name: "Bulleit Bourbon", brand: "Bulleit", category: "Bourbon", size: "750ml", abv: 45.0, retailPrice: 29.99, costPrice: 18.00, quantity: 36, tags: ["popular"] },
    { sku: "AE-RYE-001", name: "Angel's Envy Rye", brand: "Angel's Envy", category: "Rye Whiskey", size: "750ml", abv: 50.0, retailPrice: 89.99, costPrice: 58.00, quantity: 6, tags: ["premium"] },
    { sku: "SZ-RYE-001", name: "Sazerac Rye", brand: "Sazerac", category: "Rye Whiskey", size: "750ml", abv: 45.0, retailPrice: 29.99, costPrice: 18.00, quantity: 18, tags: ["popular"] },
    { sku: "WP-10-001", name: "WhistlePig 10 Year Rye", brand: "WhistlePig", category: "Rye Whiskey", size: "750ml", abv: 50.0, retailPrice: 79.99, costPrice: 52.00, quantity: 8, tags: ["premium"] },
    { sku: "HW-DR-001", name: "High West Double Rye", brand: "High West", category: "Rye Whiskey", size: "750ml", abv: 46.0, retailPrice: 34.99, costPrice: 22.00, quantity: 18, tags: ["popular"] },
    { sku: "TM-RYE-001", name: "Templeton Rye", brand: "Templeton", category: "Rye Whiskey", size: "750ml", abv: 40.0, retailPrice: 29.99, costPrice: 18.00, quantity: 18, tags: ["popular"] },
    { sku: "BU-RYE-001", name: "Bulleit Rye", brand: "Bulleit", category: "Rye Whiskey", size: "750ml", abv: 45.0, retailPrice: 29.99, costPrice: 18.00, quantity: 24, tags: ["popular"] },
    { sku: "JA-001", name: "Jameson Irish Whiskey", brand: "Jameson", category: "Irish Whiskey", size: "750ml", abv: 40.0, retailPrice: 29.99, costPrice: 18.00, quantity: 48, tags: ["best-seller"] },
    { sku: "RB-12-001", name: "Redbreast 12 Year", brand: "Redbreast", category: "Irish Whiskey", size: "750ml", abv: 40.0, retailPrice: 69.99, costPrice: 45.00, quantity: 12, tags: ["premium", "staff-pick"] },
    { sku: "GS-001", name: "Green Spot Irish Whiskey", brand: "Green Spot", category: "Irish Whiskey", size: "750ml", abv: 40.0, retailPrice: 54.99, costPrice: 35.00, quantity: 8, tags: ["premium"] },
    { sku: "MC-12-001", name: "Macallan 12 Year Double Cask", brand: "Macallan", category: "Scotch", size: "750ml", abv: 43.0, retailPrice: 64.99, costPrice: 42.00, quantity: 18, tags: ["premium", "popular"] },
    { sku: "MC-15-001", name: "Macallan 15 Year", brand: "Macallan", category: "Scotch", size: "750ml", abv: 43.0, retailPrice: 109.99, costPrice: 72.00, quantity: 6, tags: ["premium", "luxury"] },
    { sku: "GF-12-001", name: "Glenfiddich 12 Year", brand: "Glenfiddich", category: "Scotch", size: "750ml", abv: 40.0, retailPrice: 44.99, costPrice: 28.00, quantity: 24, tags: ["popular"] },
    { sku: "GL-12-001", name: "Glenlivet 12 Year", brand: "Glenlivet", category: "Scotch", size: "750ml", abv: 40.0, retailPrice: 44.99, costPrice: 28.00, quantity: 24, tags: ["popular"] },
    { sku: "LG-16-001", name: "Lagavulin 16 Year", brand: "Lagavulin", category: "Scotch", size: "750ml", abv: 43.0, retailPrice: 89.99, costPrice: 58.00, quantity: 8, tags: ["premium", "peated", "staff-pick"] },
    { sku: "AR-10-001", name: "Ardbeg 10 Year", brand: "Ardbeg", category: "Scotch", size: "750ml", abv: 46.0, retailPrice: 54.99, costPrice: 35.00, quantity: 12, tags: ["peated", "popular"] },
    { sku: "BR-CL-001", name: "Bruichladdich Classic Laddie", brand: "Bruichladdich", category: "Scotch", size: "750ml", abv: 50.0, retailPrice: 54.99, costPrice: 35.00, quantity: 10, tags: ["unpeated"] },
    { sku: "HP-12-001", name: "Highland Park 12 Year", brand: "Highland Park", category: "Scotch", size: "750ml", abv: 43.0, retailPrice: 49.99, costPrice: 32.00, quantity: 15, tags: ["popular"] },
    { sku: "DJ-BL-001", name: "Don Julio Blanco", brand: "Don Julio", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 49.99, costPrice: 32.00, quantity: 24, tags: ["popular"] },
    { sku: "DJ-RP-001", name: "Don Julio Reposado", brand: "Don Julio", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 54.99, costPrice: 35.00, quantity: 18, tags: ["popular"] },
    { sku: "DJ-AN-001", name: "Don Julio Añejo", brand: "Don Julio", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 59.99, costPrice: 38.00, quantity: 12, tags: ["premium"] },
    { sku: "CZ-RP-001", name: "Clase Azul Reposado", brand: "Clase Azul", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 169.99, costPrice: 110.00, quantity: 4, tags: ["premium", "luxury"] },
    { sku: "CM-BL-001", name: "Casamigos Blanco", brand: "Casamigos", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 44.99, costPrice: 28.00, quantity: 24, tags: ["popular"] },
    { sku: "CM-RP-001", name: "Casamigos Reposado", brand: "Casamigos", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 49.99, costPrice: 30.00, quantity: 18, tags: ["popular"] },
    { sku: "PT-SV-001", name: "Patrón Silver", brand: "Patrón", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 44.99, costPrice: 28.00, quantity: 24, tags: ["popular"] },
    { sku: "PT-RP-001", name: "Patrón Reposado", brand: "Patrón", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 54.99, costPrice: 35.00, quantity: 15, tags: ["popular"] },
    { sku: "ES-BL-001", name: "Espolòn Blanco", brand: "Espolòn", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 24.99, costPrice: 15.00, quantity: 36, tags: ["value", "best-seller"] },
    { sku: "ES-RP-001", name: "Espolòn Reposado", brand: "Espolòn", category: "Tequila", size: "750ml", abv: 40.0, retailPrice: 27.99, costPrice: 17.00, quantity: 30, tags: ["value"] },
    { sku: "GG-003", name: "Grey Goose Vodka", brand: "Grey Goose", category: "Vodka", size: "750ml", abv: 40.0, retailPrice: 34.99, costPrice: 22.00, quantity: 36, tags: ["popular"] },
    { sku: "TH-001", name: "Tito's Handmade Vodka", brand: "Tito's", category: "Vodka", size: "750ml", abv: 40.0, retailPrice: 24.99, costPrice: 15.00, quantity: 60, tags: ["best-seller"] },
    { sku: "AB-001", name: "Absolut Vodka", brand: "Absolut", category: "Vodka", size: "750ml", abv: 40.0, retailPrice: 21.99, costPrice: 13.00, quantity: 48, tags: ["popular"] },
    { sku: "KO-001", name: "Ketel One Vodka", brand: "Ketel One", category: "Vodka", size: "750ml", abv: 40.0, retailPrice: 24.99, costPrice: 15.00, quantity: 36, tags: ["popular"] },
    { sku: "HN-VS-001", name: "Hennessy VS", brand: "Hennessy", category: "Cognac", size: "750ml", abv: 40.0, retailPrice: 39.99, costPrice: 25.00, quantity: 30, tags: ["popular"] },
    { sku: "HN-VSOP-001", name: "Hennessy VSOP", brand: "Hennessy", category: "Cognac", size: "750ml", abv: 40.0, retailPrice: 54.99, costPrice: 35.00, quantity: 18, tags: ["premium"] },
    { sku: "RM-VSOP-001", name: "Rémy Martin VSOP", brand: "Rémy Martin", category: "Cognac", size: "750ml", abv: 40.0, retailPrice: 49.99, costPrice: 32.00, quantity: 18, tags: ["popular"] },
  ];

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of products) {
    const slug = catSlugMap[p.category];
    const categoryId = slug ? catMap[slug] : undefined;
    if (!categoryId) {
      errors.push(`No category for: ${p.name} (${p.category})`);
      continue;
    }

    const existing = await db.product.findUnique({
      where: { storeId_sku: { storeId, sku: p.sku } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const margin = p.retailPrice > 0
      ? ((p.retailPrice - p.costPrice) / p.retailPrice) * 100
      : 0;

    await db.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        categoryId,
        storeId,
        costPrice: p.costPrice,
        retailPrice: p.retailPrice,
        quantity: p.quantity,
        size: p.size,
        abv: p.abv,
        margin,
        reorderPoint: Math.max(3, Math.floor(p.quantity * 0.25)),
        supplierId: defaultSupplierId,
        tags: p.tags,
        isActive: true,
        isAgeRestricted: true,
      },
    });
    created++;
  }

  return Response.json({
    message: `Created ${created} products, skipped ${skipped} existing`,
    created,
    skipped,
    errors,
    totalInCatalog: products.length,
  });
}
