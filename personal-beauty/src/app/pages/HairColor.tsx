// src/components/page/HairColor.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { VIEWS } from "../constants/views";

export default function HairColor() {
  const { stream, videoRef, error: webcamError } = useWebcam();
  const [colorTone, setColorTone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFaceLandmarkerReady, setIsFaceLandmarkerReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const initializeFaceLandmarker = async () => {
      try {
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
        setIsFaceLandmarkerReady(true);
        console.log("[HairColor] FaceLandmarker initialized");
      } catch (err) {
        console.error("[HairColor] Error initializing FaceLandmarker:", err);
        setError("Failed to initialize face detection.");
      }
    };

    initializeFaceLandmarker();

    return () => {
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
      setIsFaceLandmarkerReady(false);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFaceLandmarkerReady || !stream || !canvasRef.current || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Failed to initialize canvas.");
      return;
    }

    const waitForVideoReady = async () => {
      let retries = 5;
      while (retries > 0 && video.readyState < 4) {
        console.log("[HairColor] Video not ready, waiting... readyState:", video.readyState);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }
    };

    const detect = async () => {
      if (!faceLandmarkerRef.current) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }

      await waitForVideoReady();

      if (video.readyState < 4) {
        setError("Failed to load webcam video for face detection.");
        return;
      }

      try {
        const results = await faceLandmarkerRef.current.detectForVideo(video, performance.now());

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let offsetX = 0;
        let offsetY = 0;

        if (videoRatio > canvasRatio) {
          drawHeight = canvas.width / videoRatio;
          offsetY = (canvas.height - drawHeight) / 2;
        } else {
          drawWidth = canvas.height * videoRatio;
          offsetX = (canvas.width - drawWidth) / 2;
        }

        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          const foreheadPoint = landmarks[10];
          const x = foreheadPoint.x * canvas.width;
          const y = foreheadPoint.y * canvas.height;

          if (x >= 10 && y >= 10 && x + 10 <= canvas.width && y + 10 <= canvas.height) {
            const imageData = ctx.getImageData(x - 10, y - 10, 20, 20);
            const tone = analyzeColorTone(imageData);
            setColorTone(tone);
          } else {
            setColorTone(null);
          }
        } else {
          setColorTone(null);
        }
      } catch (err) {
        console.error("[HairColor] Error during face detection:", err);
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isFaceLandmarkerReady, stream]);

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
      title="Hair Color"
      description="Analyze your hair color using live video."
      videoRef={videoRef}
      canvasRef={canvasRef}
      result={colorTone}
      error={error || webcamError}
    />
  );
}