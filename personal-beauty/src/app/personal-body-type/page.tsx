"use client"

// src/app/personal-body-type/page.tsx
import { useState } from "react";
import UploadImage from "../components/UploadImage";
import VideoDetect from "../components/VideoDetect";

export default function PersonalBodyType() {
  const [isVideoActive, setIsVideoActive] = useState(false);

  const handleImageUpload = (file: File) => {
    console.log("Uploaded image:", file);
    setIsVideoActive(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-pink-600">Personal Body Type</h1>
      <p className="text-lg text-gray-700">
        Upload a full-body photo (standing straight) to analyze your body type.
      </p>

      <div className="bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Upload Image</h2>
        <UploadImage onImageUpload={handleImageUpload} />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Live Detection</h2>
        <VideoDetect isActive={isVideoActive} />
        <div className="mt-4">
          <p className="text-gray-700">Result: (Kiểu cơ thể sẽ hiển thị ở đây)</p>
        </div>
      </div>
    </div>
  );
}