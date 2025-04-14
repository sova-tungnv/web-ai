// src/components/LoadingOverlay.tsx
"use client";

import React from "react";

interface LoadingOverlayProps {
  isLoading: boolean;
}

export default function LoadingOverlay({ isLoading }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-300"
      style={{ backgroundColor: "rgba(255, 228, 230, 0.8)" }}
    >
      <div className="flex flex-col items-center">
        {/* Spinner lớn hơn cho TV */}
        <div className="w-24 h-24 border-6 border-t-6 border-t-pink-500 border-gray-300 rounded-full animate-spin"></div>
        {/* Font chữ lớn và rõ ràng */}
        <p className="mt-6 text-2xl font-semibold text-gray-800">Loading...</p>
      </div>
    </div>
  );
}