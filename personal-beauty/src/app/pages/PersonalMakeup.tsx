// src/components/page/PersonalMakeup.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { FaceMesh, FilesetResolver } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { VIEWS } from "../constants/views";

export default function PersonalMakeup() {
  const { stream, videoRef, error: webcamError } = useWebcam();
  const [makeupSuggestion, setMakeupSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFaceMeshReady, setIsFaceMeshReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const initializeFaceMesh = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        const faceMesh = await FaceMesh.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_mesh/face_mesh/float16/1/face_mesh.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          maxFaces: 1,
        });

        faceMeshRef.current = faceMesh;
        setIsFaceMeshReady(true);
        console.log("[PersonalMakeup] FaceMesh initialized");
      } catch (err) {
        console.error("[PersonalMakeup] Error initializing FaceMesh:", err);
        setError("Failed to initialize face mesh.");
      }
    };

    initializeFaceMesh();

    return () => {
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
      setIsFaceMeshReady(false);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFaceMeshReady || !stream || !canvasRef.current || !videoRef.current) {
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
        console.log("[PersonalMakeup] Video not ready, waiting... readyState:", video.readyState);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }
    };

    const detect = async () => {
      if (!faceMeshRef.current) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }

      await waitForVideoReady();

      if (video.readyState < 4) {
        setError("Failed to load webcam video for face mesh.");
        return;
      }

      try {
        const results = await faceMeshRef.current.detectForVideo(video, performance.now());

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
          const eyeDistance = Math.sqrt(
            Math.pow(landmarks[33].x - landmarks[263].x, 2) +
            Math.pow(landmarks[33].y - landmarks[263].y, 2)
          );

          if (eyeDistance > 0.1) {
            setMakeupSuggestion("Try bold eyeliner to accentuate your eyes.");
          } else {
            setMakeupSuggestion("Try soft eyeshadow for a balanced look.");
          }
        } else {
          setMakeupSuggestion(null);
        }
      } catch (err) {
        console.error("[PersonalMakeup] Error during face mesh detection:", err);
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isFaceMeshReady, stream]);

  return (
    <AnalysisLayout
      title="Personal Makeup"
      description="Get makeup suggestions based on your facial features."
      videoRef={videoRef}
      canvasRef={canvasRef}
      result={makeupSuggestion}
      error={error || webcamError}
    />
  );
}