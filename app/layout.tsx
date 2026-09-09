import "./globals.css";
export const metadata = {
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
