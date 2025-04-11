"use client"

// src/components/VideoDetect.tsx
import { useRef, useEffect } from "react";

interface VideoDetectProps {
  isActive: boolean;
}

export default function VideoDetect({ isActive }: VideoDetectProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Truy cập webcam
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (video) {
          video.srcObject = stream;
          video.play();
        }
      })
      .catch((err) => {
        console.error("Error accessing webcam:", err);
      });

    // Logic MediaPipe sẽ được thêm sau
    const draw = () => {
      if (ctx && video) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Thêm logic detect của MediaPipe ở đây
        requestAnimationFrame(draw);
      }
    };

    draw();
  }, [isActive]);

  return (
    <div className="relative">
      <video ref={videoRef} className="hidden" />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full max-w-2xl rounded-lg shadow-md"
      />
    </div>
  );
}