"use client"
// src/app/personal-makeup/page.tsx
import { useState } from "react";
import UploadImage from "../components/UploadImage";
import VideoDetect from "../components/VideoDetect";

export default function PersonalMakeup() {
  const [isVideoActive, setIsVideoActive] = useState(false);

  const handleImageUpload = (file: File) => {
    console.log("Uploaded image:", file);
    setIsVideoActive(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-pink-600">Personal Makeup</h1>
      <p className="text-lg text-gray-700">
        Upload a clear photo of your face to get makeup recommendations.
      </p>

      <div className="bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Upload Image</h2>
        <UploadImage onImageUpload={handleImageUpload} />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Live Detection</h2>
        <VideoDetect isActive={isVideoActive} />
        <div className="mt-4">
          <p className="text-gray-700">Result: (Gợi ý trang điểm sẽ hiển thị ở đây)</p>
        </div>
      </div>
    </div>
  );
}