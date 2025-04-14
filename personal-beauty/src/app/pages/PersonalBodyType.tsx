// src/pages/PersonalBodyType.tsx
"use client";

import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext"; // Thêm import
import { VIEWS } from "../constants/views";

export default function PersonalBodyType() {
  return (
    <div className="flex-1 p-8">
      <h1 className="text-3xl font-bold text-pink-600">Personal Body Type</h1>
      <p className="text-lg text-gray-600 mt-4">Analyze your body type (coming soon).</p>
      <button
        className="menu-item bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600 mt-4"
        data-view={VIEWS.HOME}
      >
        Back to Home
      </button>
    </div>
  );
}