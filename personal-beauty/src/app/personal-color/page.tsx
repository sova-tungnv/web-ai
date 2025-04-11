// src/app/personal-color/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import AnalysisLayout from "../components/AnalysisLayout";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function PersonalColor() {
  const [colorTone, setColorTone] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  useEffect(() => {
    const initializeFaceLandmarker = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
      );
      const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });

      faceLandmarkerRef.current = faceLandmarker;
    };

    initializeFaceLandmarker();
  }, []);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        video.srcObject = stream;
        video.play();

        const detect = async () => {
          if (!faceLandmarkerRef.current || !ctx) return;

          const currentTimeMs = performance.now();
          if (lastVideoTimeRef.current !== video.currentTime) {
            lastVideoTimeRef.current = video.currentTime;

            const results = await faceLandmarkerRef.current.detectForVideo(video, currentTimeMs);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
              const landmarks = results.faceLandmarks[0];
              const foreheadPoint = landmarks[10];
              const x = foreheadPoint.x * canvas.width;
              const y = foreheadPoint.y * canvas.height;

              const imageData = ctx.getImageData(x - 10, y - 10, 20, 20);
              const tone = analyzeColorTone(imageData);
              setColorTone(tone);
            }
          }

          requestAnimationFrame(detect);
        };

        detect();
      })
      .catch((err) => {
        console.error("[PersonalColor] Error accessing webcam:", err);
      });

    return () => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      faceLandmarkerRef.current?.close();
    };
  }, []);

  const analyzeColorTone = (imageData: ImageData): string => {
    const data = imageData.data;
    let r = 0,
      g = 0,
      b = 0;

    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    const pixelCount = data.length / 4;
    r = r / pixelCount;
    g = g / pixelCount;
    b = b / pixelCount;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0,
      s = 0,
      v = max;

    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
      h = 0;
    } else {
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }

    if (h < 0.1 || h > 0.9) return "Warm";
    if (h > 0.3 && h < 0.6) return "Cool";
    return "Neutral";
  };

  return (
    <AnalysisLayout
      title="Personal Color"
      description="Analyze your personal color tone using live video."
      videoRef={videoRef}
      canvasRef={canvasRef}
      result={colorTone}
    />
  );
}