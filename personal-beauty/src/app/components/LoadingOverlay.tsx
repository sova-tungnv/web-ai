// src/components/LoadingOverlay.tsx
"use client";

import React, { useEffect, useState } from "react";

interface LoadingOverlayProps {
  isLoading: boolean;
}

export default function LoadingOverlay({ isLoading }: LoadingOverlayProps) {
  const [visible, setVisible] = useState(isLoading);

  // Fade out animation and safety timeout
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isLoading) {
      setVisible(true);
      timeout = setTimeout(() => setVisible(false), 8000); // fallback auto-hide
    } else {
      // Wait for fade-out before unmount
      timeout = setTimeout(() => setVisible(false), 300);
    }
    return () => clearTimeout(timeout);
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-300 ${isLoading ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      style={{ backgroundColor: "rgba(255, 228, 230, 0.8)" }}
    >
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 border-6 border-t-6 border-t-pink-500 border-gray-300 rounded-full animate-spin" />
        <p className="mt-6 text-2xl font-semibold text-pink-800">Loading...</p>
      </div>
    </div>
  );
}