// src/app/layout.tsx
import type { Metadata } from "next";
import HandControlledApp from "./components/HandControlledApp";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Beauty",
  description: "Diagnosis based on individual appearance characteristics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <HandControlledApp>{children}</HandControlledApp>
      </body>
    </html>
  );
}