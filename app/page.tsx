export default function Home() {
    return (
      <main>
        <h1>HOUSE OF EON CRM</h1>
  
        <p className="muted">
          Internal dashboard for WhatsApp campaigns, customer replies, orders, and
          campaign tracking.
        </p>
  
        <div className="nav">
          <a href="/orders">Orders</a>
          <a href="/customers">Customers</a>
          <a href="/campaigns">Campaigns</a>
          <a href="/campaign-history">Campaign History</a>
          <a href="/inbox">Inbox</a>
          <a href="/messages">Messages</a>
        </div>
  
        <div className="card">
          <h2>Daily Flow</h2>
          <p>
            Check orders → update shipping status → manage WhatsApp replies → send
            campaigns → track sales.
          </p>
        </div>
      </main>
    );
  }