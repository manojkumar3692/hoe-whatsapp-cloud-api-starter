import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function Campaigns() {
  const supabase = supabaseAdmin();

  const { data: products } = await supabase
    .from("customers")
    .select("product")
    .not("product", "is", null);

  const unique = [
    ...new Set((products || []).map((x: any) => x.product).filter(Boolean)),
  ];

  return (
    <main>
      <div className="nav">
        <a href="/">Home</a>
        <a href="/customers">Customers</a>
        <a href="/messages">Messages</a>
        <a href="/inbox">Inbox</a>
        <a href="/campaign-history">Campaign History</a>
      </div>

      <h1>Send Campaign</h1>

      <div className="card">
        <p className="muted">
          Only use approved Meta template names. Start with 3–5 customers first.
        </p>

        <form
  action="/api/campaigns/preview"
  method="post"
  encType="multipart/form-data"
  className="grid"
>
          <input
            name="admin_password"
            placeholder="Admin password"
            type="password"
            required
          />

          <input
            name="audience_file"
            type="file"
            accept=".csv"
            placeholder="Upload audience CSV"
          />


          <input
            name="campaign_name"
            defaultValue="Desert Tonka Launch"
            placeholder="Campaign name"
            required
          />

          <input
            name="coupon_code"
            defaultValue="EON20"
            placeholder="Coupon code e.g. EON20"
          />

          <input
            name="template_name"
            defaultValue="arctic_waves_promotion"
            placeholder="Approved template name"
            required
          />

          <input name="language_code" defaultValue="en" />

          <input
            name="header_image_url"
            defaultValue="https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/DESERT_TONKA_PROMOTION.png"
            placeholder="Header Image URL"
          />

          <input
            name="body_param_1"
            placeholder="Body param 1 - leave empty to use customer name"
          />

          <input
            name="body_param_2"
            placeholder="Body param 2 if template needs it"
          />

          <input
            name="body_param_3"
            placeholder="Body param 3 if template needs it"
          />

          <input
            name="button_url_param"
            placeholder="Button URL param only for dynamic URL templates"
          />

          <select name="product">
            <option value="">All products</option>
            {unique.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <input
            name="limit"
            type="number"
            defaultValue="3"
            min="1"
            max="500"
          />

         <button type="submit">Preview Audience</button>
        </form>
      </div>
    </main>
  );
}
