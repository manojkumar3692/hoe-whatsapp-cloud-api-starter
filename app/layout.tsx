import "./globals.css";
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#1c1712" };
export const metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Eon Operations" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  title: "HOUSE OF EON Operations",
  description: "Orders, fulfilment, customers, inventory, and WhatsApp operations",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
