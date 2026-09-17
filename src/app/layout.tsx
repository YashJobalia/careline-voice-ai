import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CareLine | A little less waiting. A little more care.",
  description:
    "A conversational clinic receptionist demo. Find your specialist, talk through your preferences, and book an appointment.",
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
