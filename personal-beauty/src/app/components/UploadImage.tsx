// src/components/UploadImage.tsx
"use client"

import { useState, ChangeEvent } from "react";

interface UploadImageProps {
    onImageUpload: (file: File) => void;
}

export default function UploadImage({ onImageUpload }: UploadImageProps) {
    const [preview, setPreview] = useState<string | null>(null);

    const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const imageUrl = URL.createObjectURL(file);
            setPreview(imageUrl);
            onImageUpload(file);
        }
    };

    return (
        <div className="flex flex-col items-center">
            <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mb-4 p-2 border rounded"
            />
            {preview && (
                <div className="w-[400px] h-[711px] mx-auto">
                    <img
                        src={preview}
                        alt="Preview"
                        className="w-full h-full object-cover rounded-2xl shadow-lg border border-gray-200"
                    />
                </div>
            )}
        </div>
    );
}