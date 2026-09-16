import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { ordersQuery } from "../../../../lib/ordersQuery";
import { parseCartItems, cartItemName } from "../../../../lib/cartItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protected by the dashboard session middleware. Fetch only on download,
// independently of the page's 300-row display limit.
export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  try {
    const rows: Record<string, string | number>[] = [];
    const batchSize = 500;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await ordersQuery(params).range(offset, offset + batchSize - 1);
      if (error) throw error;
      for (const order of data || []) {
        rows.push({
          "Order number": order.order_number || "",
          "Created at (UTC)": order.created_at || "",
          Customer: order.customer_name || "",
          Phone: String(order.customer_phone || ""),
          Email: order.customer_email || "",
          Address: order.customer_address || "",
          City: order.customer_city || "",
          State: order.customer_state || "",
          Pincode: String(order.customer_pincode || ""),
          Items: parseCartItems(order.items).map(item => `${cartItemName(item) || "Item"} × ${item.quantity ?? 1}`).join("; "),
          "Total (INR)": (order.amount_in_paise || 0) / 100,
          "Token paid (INR)": (order.token_amount_in_paise || 0) / 100,
          "Balance due (INR)": (order.balance_due_in_paise || 0) / 100,
          "Payment status": order.payment_status || "",
          "Payment type": order.payment_type || "",
          "COD balance status": order.cod_balance_status || "",
          "Fulfillment status": order.shipping_status || "",
          Coupon: order.coupon_code || "",
          "Delhivery waybill": String(order.delhivery_waybill || ""),
          "Delhivery status": order.delhivery_last_status_raw || "",
          "Shiprocket waybill": String(order.shiprocket_waybill || ""),
          "Shiprocket status": order.shiprocket_last_status_raw || "",
        });
      }
      if ((data || []).length < batchSize) break;
    }
    const headers = ["Order number", "Created at (UTC)", "Customer", "Phone", "Email", "Address", "City", "State", "Pincode", "Items", "Total (INR)", "Token paid (INR)", "Balance due (INR)", "Payment status", "Payment type", "COD balance status", "Fulfillment status", "Coupon", "Delhivery waybill", "Delhivery status", "Shiprocket waybill", "Shiprocket status"];
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    sheet["!cols"] = headers.map(header => ({ wch: header === "Items" || header === "Address" ? 45 : 24 }));
    sheet["!autofilter"] = { ref: sheet["!ref"]! };
    for (let row = 2; row <= rows.length + 1; row++) {
      for (const col of ["K", "L", "M"]) sheet[`${col}${row}`].z = '#,##0.00';
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Orders");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const view = params.show_hidden === "1" ? "hidden" : (params.view || "all").replace(/[^a-z_]/gi, "");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="orders-${view}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not export orders. Please try again." }, { status: 500 });
  }
}
