import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function Customers() {
  const supabase = supabaseAdmin();

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main style={{ padding: 20 }}>
      <div className="nav" style={{ marginBottom: 20 }}>
        <a href="/">Home</a>{" | "}
        <a href="/campaigns">Campaigns</a>{" | "}
        <a href="/messages">Messages</a>
        <a href="/inbox">Inbox</a>
        <a href="/campaign-history">Campaign History</a>
      </div>

      <h1>Customers</h1>

      <div
        className="card"
        style={{
          padding: 20,
          marginBottom: 30,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <h2>Import Customers CSV</h2>

        <p>
          CSV Headers:
          <br />
          <b>name, phone, product, city</b>
        </p>

        <form
          action="/api/customers/import"
          method="POST"
          encType="multipart/form-data"
        >
          <div style={{ marginBottom: 15 }}>
            <input
              type="password"
              name="admin_password"
              placeholder="Admin Password"
              required
              style={{
                width: 300,
                padding: 10,
              }}
            />
          </div>

          <div style={{ marginBottom: 15 }}>
            <input
              type="file"
              name="file"
              accept=".csv"
              required
            />
          </div>

          <button
            type="submit"
            style={{
              padding: "10px 25px",
              cursor: "pointer",
            }}
          >
            Import CSV
          </button>
        </form>
      </div>

      <div
        className="card"
        style={{
          padding: 20,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <h2>Customer List ({customers?.length ?? 0})</h2>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Product</th>
              <th>City</th>
            </tr>
          </thead>

          <tbody>
            {customers?.map((customer: any) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.phone}</td>
                <td>{customer.product}</td>
                <td>{customer.city}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}