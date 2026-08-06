export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: "1px solid #eadfce",
          borderRadius: 18,
          boxShadow: "0 8px 22px rgba(0,0,0,.06)",
          padding: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#1c1712",
              color: "#e8c88a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            E
          </span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1c1712", lineHeight: 1.2 }}>
              HOUSE OF EON
            </div>
            <div style={{ fontSize: 11, color: "#9a8f80", lineHeight: 1.2 }}>
              WhatsApp Commerce Console
            </div>
          </div>
        </div>

        <h1 style={{ fontSize: 18, marginBottom: 4 }}>Admin Login</h1>
        <p style={{ color: "#777", fontSize: 13, marginBottom: 20 }}>
          Sign in to access the dashboard.
        </p>

        {params.error === "1" && (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Incorrect username or password.
          </div>
        )}

        <form action="/api/auth/login" method="POST">
          {params.next && <input type="hidden" name="next" value={params.next} />}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
              Username
            </label>
            <input
              name="username"
              autoFocus
              required
              style={{
                width: "100%",
                padding: 11,
                borderRadius: 8,
                border: "1px solid #ddd",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              style={{
                width: "100%",
                padding: 11,
                borderRadius: 8,
                border: "1px solid #ddd",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: 0,
              background: "#1c1712",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Log In
          </button>
        </form>
      </div>
    </main>
  );
}
