// src/app/layout.tsx
import type { Metadata } from "next";
import { WebcamProvider } from "./context/WebcamContext";
import { LoadingProvider } from "./context/LoadingContext";
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
      <head>
        <link rel="preload" href="/wasm/vision_wasm_internal.wasm" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/wasm/vision_wasm_internal.js" as="script" />
        <link rel="preload" href="/models/hand_landmarker.task" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/models/face_landmarker.task" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/models/pose_landmarker.task" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/models/hair_segmenter.tflite" as="fetch" crossOrigin="anonymous" />
      </head>
      <body>
        <LoadingProvider>
          <WebcamProvider>
            {children}
          </WebcamProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}