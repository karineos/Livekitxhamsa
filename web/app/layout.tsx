import "./globals.css";

export const metadata = {
  title: "Saudi Voice Agent",
  description: "Voice AI using Hamsa, Qdrant, and Azure OpenAI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar">
      <body>{children}</body>
    </html>
  );
}
