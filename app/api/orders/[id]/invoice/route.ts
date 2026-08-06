import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { supabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { parseCartItems } from "../../../../../lib/cartItems";

// Runs on the Node runtime (not Edge) — pdfkit reads its built-in font
// metrics from disk, which only works with a real Node filesystem.
export const runtime = "nodejs";

// ------------------------------------------------------------------
// Seller / GST details — House of Eon is GST-registered in Tamil Nadu.
// GSTIN prefix "33" = Tamil Nadu, which is also how we decide CGST+SGST
// (same state as buyer) vs IGST (different state) below.
// ------------------------------------------------------------------
const SELLER = {
  name: "HOUSE OF EON",
  addressLines: ["NO13 SENNA FLATS RAMAPURAM RAMSWAMY STREET", "WEST SAIDAPET, CHENNAI - 600015"],
  gstin: "33BHKPS2697M1ZJ",
  state: "Tamil Nadu",
};

const GST_RATE = 0.18;

function isTamilNadu(state: string | null) {
  const s = (state || "").trim().toLowerCase();
  return s === "tn" || s === "tamilnadu" || s === "tamil nadu";
}

function formatINR(paise: number) {
  return `Rs. ${((paise || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function itemName(item: any): string {
  return item.name || item.title || item.product || item.product_name || "Item";
}

function itemQty(item: any): number {
  return item.quantity || item.qty || 1;
}

function itemPriceLabel(item: any): string {
  if (item.price_in_paise) return formatINR(item.price_in_paise);
  if (item.price) return formatINR(Number(item.price) * 100);
  return "-";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: error?.message || "Order not found" }, { status: 404 });
  }

  const items = parseCartItems(order.items);

  // GST is calculated on the FULL order value the customer is committed to
  // paying (order.amount_in_paise) — never on just the online-collected
  // portion. A partial_cod order where only a Rs.99 token was paid online
  // still bills, and pays tax on, the full order amount; the token/balance
  // split is shown separately below as payment info, not as the invoice
  // value.
  const grandTotalPaise = order.amount_in_paise || 0;
  const taxableValuePaise = Math.round(grandTotalPaise / (1 + GST_RATE));
  const totalGstPaise = grandTotalPaise - taxableValuePaise;

  const intraState = isTamilNadu(order.customer_state);
  const cgstPaise = intraState ? Math.round(totalGstPaise / 2) : 0;
  const sgstPaise = intraState ? totalGstPaise - cgstPaise : 0;
  const igstPaise = intraState ? 0 : totalGstPaise;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // ------------------------------------------------------------------
  // Seller header
  // ------------------------------------------------------------------
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#000").text(SELLER.name);
  doc.fontSize(9).font("Helvetica").fillColor("#444");
  for (const line of SELLER.addressLines) doc.text(line);
  doc.text(`GSTIN: ${SELLER.gstin}`);
  doc.moveDown(0.6);
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000").text("Tax Invoice");
  doc.moveDown(0.8);

  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor("#000")
    .text(`Invoice No: ${order.order_number}`);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#444")
    .text(
      `Date: ${new Date(order.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    );
  doc.text(`Place of Supply: ${order.customer_state || "-"} (${intraState ? "Intra-state" : "Inter-state"})`);
  doc.moveDown(1);

  // ------------------------------------------------------------------
  // Bill to
  // ------------------------------------------------------------------
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#000").text("Bill To");
  doc.fontSize(10).font("Helvetica").fillColor("#333");
  doc.text(order.customer_name || "-");
  if (order.customer_address) doc.text(order.customer_address);
  const cityLine = [order.customer_city, order.customer_state, order.customer_pincode]
    .filter(Boolean)
    .join(", ");
  if (cityLine) doc.text(cityLine);
  if (order.customer_phone) doc.text(`Phone: ${order.customer_phone}`);
  if (order.customer_email) doc.text(`Email: ${order.customer_email}`);
  doc.moveDown(1.2);

  // ------------------------------------------------------------------
  // Items table (prices shown are GST-inclusive, same as what the
  // customer sees on the storefront)
  // ------------------------------------------------------------------
  const tableTop = doc.y;
  const col = { name: 50, qty: 340, price: 410, total: 490 };

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
  doc.text("Item", col.name, tableTop);
  doc.text("Qty", col.qty, tableTop);
  doc.text("Price", col.price, tableTop);
  doc.text("Total", col.total, tableTop);

  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor("#ccc").stroke();

  let y = tableTop + 22;
  doc.font("Helvetica").fontSize(10).fillColor("#333");

  // The cart stores each item's original (pre-coupon) catalog price, but
  // the coupon discount is applied once at the order level — so summing
  // the raw item prices doesn't match what the customer actually paid.
  // Distribute the discount proportionally across items here so the Price
  // / Total columns show the real, discounted amount (matching the Grand
  // Total below), instead of the misleading pre-discount catalog price.
  const rawLineTotals = items.map((item) => {
    const qty = itemQty(item);
    if (item.price_in_paise) return item.price_in_paise * qty;
    if (item.price) return Math.round(Number(item.price) * 100 * qty);
    return 0;
  });
  const rawItemsTotalPaise = rawLineTotals.reduce((a, b) => a + b, 0);
  const hasDiscount = !!rawItemsTotalPaise && rawItemsTotalPaise !== grandTotalPaise;

  const displayLineTotals: (number | null)[] = items.map((_item, idx) => {
    if (!rawLineTotals[idx]) return null; // no price data recorded for this item
    if (!hasDiscount) return rawLineTotals[idx];
    return Math.round((rawLineTotals[idx] * grandTotalPaise) / rawItemsTotalPaise);
  });

  // Rounding the proportional split can leave the displayed lines a paise
  // or two short of/over the real grand total — nudge the last priced
  // item so the column always foots exactly to Grand Total below.
  if (hasDiscount) {
    const sumDisplayed = displayLineTotals.reduce((a: number, b) => a + (b || 0), 0);
    const diff = grandTotalPaise - sumDisplayed;
    if (diff !== 0) {
      for (let i = displayLineTotals.length - 1; i >= 0; i--) {
        if (displayLineTotals[i] != null) {
          displayLineTotals[i] = (displayLineTotals[i] as number) + diff;
          break;
        }
      }
    }
  }

  if (items.length === 0) {
    doc.text("No item details recorded for this order.", col.name, y);
    y += 18;
  } else {
    items.forEach((item, idx) => {
      const qty = itemQty(item);
      const lineTotalPaise = displayLineTotals[idx];
      const priceLabel = lineTotalPaise != null ? formatINR(Math.round(lineTotalPaise / qty)) : itemPriceLabel(item);

      doc.text(itemName(item), col.name, y, { width: 280 });
      doc.text(String(qty), col.qty, y);
      doc.text(priceLabel, col.price, y);
      doc.text(lineTotalPaise != null ? formatINR(lineTotalPaise) : "-", col.total, y);
      y += 20;
    });
  }

  doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor("#ccc").stroke();
  y += 16;

  // ------------------------------------------------------------------
  // GST-inclusive totals — always based on the full order value, so the
  // invoice total always matches the price the customer is actually
  // paying for the goods, regardless of how the payment was split.
  // ------------------------------------------------------------------
  const totalsX = 370;
  doc.font("Helvetica").fontSize(10).fillColor("#333");

  doc.text("Taxable Value", totalsX, y);
  doc.text(formatINR(taxableValuePaise), col.total, y);
  y += 16;

  if (intraState) {
    doc.text("CGST @ 9%", totalsX, y);
    doc.text(formatINR(cgstPaise), col.total, y);
    y += 16;

    doc.text("SGST @ 9%", totalsX, y);
    doc.text(formatINR(sgstPaise), col.total, y);
    y += 16;
  } else {
    doc.text("IGST @ 18%", totalsX, y);
    doc.text(formatINR(igstPaise), col.total, y);
    y += 16;
  }

  if (order.coupon_discount_in_paise) {
    doc.fontSize(8).fillColor("#888");
    doc.text(
      `(Coupon "${order.coupon_code || ""}" discount of ${formatINR(
        order.coupon_discount_in_paise
      )} applied — item prices above already reflect it)`,
      totalsX,
      y,
      { width: 175 }
    );
    y += 22;
    doc.fontSize(10).fillColor("#333");
  }

  doc.moveTo(totalsX, y).lineTo(545, y).strokeColor("#ccc").stroke();
  y += 8;

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000");
  doc.text("Grand Total (incl. GST)", totalsX, y, { width: 175 });
  doc.text(formatINR(grandTotalPaise), col.total, y);
  y += 28;

  // ------------------------------------------------------------------
  // Payment info — informational only, never changes the invoice value
  // above. A partial_cod order still bills the full grand total; this
  // just explains how much of it was collected online vs on delivery.
  // ------------------------------------------------------------------
  doc.font("Helvetica").fontSize(10).fillColor("#333");

  if (order.payment_type === "partial_cod") {
    doc.text(
      `Payment: ${formatINR(order.token_amount_in_paise)} paid online, ` +
        `${formatINR(order.balance_due_in_paise)} payable by cash/UPI on delivery. ` +
        `Order payment status: ${order.payment_status}.`,
      50,
      y,
      { width: 495 }
    );
    y += 30;
  } else {
    doc.text(`Payment status: ${order.payment_status}`, 50, y);
    y += 20;
  }

  doc
    .fontSize(8)
    .fillColor("#999")
    .text("This is a computer-generated tax invoice and does not require a signature.", 50, y);

  doc.end();
  const pdfBuffer = await done;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${order.order_number}.pdf"`,
    },
  });
}
