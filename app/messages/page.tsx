import { supabaseAdmin } from "../../lib/supabaseAdmin";
export default async function Messages() {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("message_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <main>
      <div className="nav">
        <a href="/">Home</a>
        <a href="/customers">Customers</a>
        <a href="/campaigns">Campaigns</a>
      </div>
      <h1>Message Logs</h1>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Phone</th>
              <th>Direction</th>
              <th>Status</th>
              <th>Body/Template</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((m: any) => (
              <tr key={m.id}>
                <td>{new Date(m.created_at).toLocaleString()}</td>
                <td>{m.phone}</td>
                <td>
                  <span className="pill">{m.direction}</span>
                </td>
                <td>{m.status}</td>
                <td>{m.body || m.template_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
