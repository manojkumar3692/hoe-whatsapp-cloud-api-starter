import Header from "../components/Header";
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
      <Header active="messages" />
      <h1>Message Logs</h1>
      <div className="card">
        <div className="table-scroll" role="region" aria-label="Scrollable records" tabIndex={0}><table role="table" className="mobile-table">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Time</th>
              <th role="columnheader" scope="col">Phone</th>
              <th role="columnheader" scope="col">Direction</th>
              <th role="columnheader" scope="col">Status</th>
              <th role="columnheader" scope="col">Body/Template</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {data?.map((m: any) => (
              <tr role="row" key={m.id}>
                <td data-label="Time" role="cell">{new Date(m.created_at).toLocaleString()}</td>
                <td data-label="Phone" role="cell">{m.phone}</td>
                <td data-label="Direction" role="cell">
                  <span className="pill">{m.direction}</span>
                </td>
                <td data-label="Status" role="cell">{m.status}</td>
                <td data-label="Body/Template" role="cell">{m.body || m.template_name}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </main>
  );
}
