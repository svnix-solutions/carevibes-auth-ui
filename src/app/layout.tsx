import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Iklera — Authorization",
  description: "Authorize third-party access to your Iklera account",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
