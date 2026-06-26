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
      </div>
      <h1>Send Campaign</h1>
      <div className="card">
        <p className="muted">
          Only use approved Meta template names. Start with 5 or 10 test
          customers first.
        </p>
        <form action="/api/campaigns/send" method="post" className="grid">
          <input
            name="admin_password"
            placeholder="Admin password"
            type="password"
            required
          />
          <input
            name="campaign_name"
            placeholder="Campaign name e.g. New launch June"
            required
          />
          <input
            name="template_name"
            placeholder="Approved template name e.g. hoe_new_launch"
            required
          />
          <input name="language_code" defaultValue="en" />
          <input
            name="body_param_1"
            placeholder="Body param 1 e.g. Customer name"
          />
          <input
            name="body_param_2"
            placeholder="Body param 2 e.g. Product/link"
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
            defaultValue="10"
            min="1"
            max="500"
          />
          <button>Send Campaign</button>
        </form>
      </div>
    </main>
  );
}
