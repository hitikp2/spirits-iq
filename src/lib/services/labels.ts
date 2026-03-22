import { db } from "@/lib/db";

// ─── Generate Shelf Tag Data ─────────────────────────────
export async function generateShelfTags(storeId: string, productIds?: string[]) {
  const where: Record<string, unknown> = { storeId, isActive: true };
  if (productIds?.length) where.id = { in: productIds };

  const products = await db.product.findMany({
    where: where as any,
    include: { category: true },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  return products.map((p) => ({
    productId: p.id,
    sku: p.sku,
    barcode: p.barcode || generateEAN13(p.sku),
    name: p.name,
    brand: p.brand,
    category: p.category.name,
    price: Number(p.retailPrice),
    compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
    size: p.size,
    abv: p.abv ? Number(p.abv) : null,
    origin: p.region,
    tags: p.tags,
    shelfLocation: p.shelfLocation,
  }));
}

// ─── Generate Printable HTML for Shelf Tags ──────────────
export function renderShelfTagsHTML(tags: Array<{
  name: string; brand?: string | null; price: number; compareAtPrice?: number | null;
  size?: string | null; category: string; barcode: string; sku: string;
  abv?: number | null; origin?: string | null; tags: string[];
}>, options?: { size?: "small" | "medium" | "large"; showBarcode?: boolean }) {
  const { size = "medium", showBarcode = true } = options || {};

  const dimensions = { small: { w: 180, h: 100 }, medium: { w: 240, h: 140 }, large: { w: 300, h: 180 } }[size];

  const tagHTML = tags.map((tag) => `
    <div class="tag" style="width:${dimensions.w}px;height:${dimensions.h}px">
      <div class="tag-header">
        <span class="category">${tag.category}</span>
        ${tag.tags.includes("staff-pick") ? '<span class="badge">★ STAFF PICK</span>' : ""}
      </div>
      <div class="tag-name">${tag.name}</div>
      ${tag.brand ? `<div class="tag-brand">${tag.brand}</div>` : ""}
      <div class="tag-details">
        ${tag.size ? `<span>${tag.size}</span>` : ""}
        ${tag.abv ? `<span>${tag.abv}%</span>` : ""}
        ${tag.origin ? `<span>${tag.origin}</span>` : ""}
      </div>
      <div class="tag-price">
        ${tag.compareAtPrice ? `<span class="compare">$${tag.compareAtPrice.toFixed(2)}</span>` : ""}
        <span class="price">$${tag.price.toFixed(2)}</span>
      </div>
      ${showBarcode ? `
      <div class="tag-barcode">
        <div class="barcode-visual">${generateBarcodeCSS(tag.barcode)}</div>
        <div class="barcode-text">${tag.barcode}</div>
      </div>` : ""}
      <div class="tag-sku">${tag.sku}</div>
    </div>
  `).join("");

  return `<!DOCTYPE html><html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Azeret+Mono:wght@400;500&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Plus Jakarta Sans',sans-serif; background:#fff; }
  .tags { display:flex; flex-wrap:wrap; gap:8px; padding:16px; }
  .tag { border:1px solid #ddd; border-radius:8px; padding:10px; display:flex; flex-direction:column; justify-content:space-between; page-break-inside:avoid; }
  .tag-header { display:flex; justify-content:space-between; align-items:center; }
  .category { font-size:9px; text-transform:uppercase; letter-spacing:0.5px; color:#888; font-family:'Azeret Mono',mono; }
  .badge { font-size:8px; background:#FFF7E6; color:#F5A623; padding:2px 6px; border-radius:4px; font-weight:600; }
  .tag-name { font-size:${size === "large" ? 14 : 12}px; font-weight:700; color:#111; margin:4px 0 2px; line-height:1.2; }
  .tag-brand { font-size:10px; color:#666; }
  .tag-details { font-size:9px; color:#999; display:flex; gap:8px; font-family:'Azeret Mono',mono; }
  .tag-price { display:flex; align-items:baseline; gap:6px; margin:4px 0; }
  .price { font-size:${size === "large" ? 22 : 18}px; font-weight:800; color:#111; }
  .compare { font-size:12px; color:#999; text-decoration:line-through; }
  .tag-barcode { text-align:center; margin-top:auto; }
  .barcode-visual { display:flex; justify-content:center; gap:1px; height:24px; }
  .barcode-text { font-size:8px; font-family:'Azeret Mono',mono; color:#333; margin-top:2px; }
  .tag-sku { font-size:8px; font-family:'Azeret Mono',mono; color:#bbb; text-align:right; }
  @media print { body { margin:0; } .tags { padding:4mm; gap:4mm; } }
</style>
</head><body><div class="tags">${tagHTML}</div></body></html>`;
}

// ─── Helpers ─────────────────────────────────────────────
function generateEAN13(sku: string): string {
  const num = sku.replace(/\D/g, "").padStart(12, "0").slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(num[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return num + check;
}

function generateBarcodeCSS(code: string): string {
  return code.replace(/\s/g, "").split("").map((d, i) => {
    const w = parseInt(d) % 2 === 0 ? 2 : 1.5;
    const show = (parseInt(d) + i) % 2 === 0;
    return `<div style="width:${w}px;height:100%;background:${show ? "#000" : "transparent"}"></div>`;
  }).join("");
}
