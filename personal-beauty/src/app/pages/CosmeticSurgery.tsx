/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/display-name */
// src/components/page/PersonalColor.tsx

"use client";

import React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import { FaceLandmarker, FilesetResolver, NormalizedLandmark } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";
import { VIEWS } from "../constants/views";

export default function CosmeticSurgery() {
    const {
        stream,
        error: webcamError,
        restartStream,
        detectionResults,
        setCurrentView,
    } = useWebcam();
    const { setIsLoading } = useLoading();
    const [colorTone, setColorTone] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [selectedArea, setSelectedArea] = useState<string | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const lastDetectTime = useRef(0);

    useEffect(() => {
        setCurrentView(VIEWS.COSMETIC_SURGERY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Kết nối video stream
    useEffect(() => {
        if (stream && displayVideoRef.current) {
            displayVideoRef.current.srcObject = stream;
            displayVideoRef.current.onloadedmetadata = () => {
                displayVideoRef.current!.play().catch((err) => {
                    console.error("[PersonalColor] Error playing video:", err);
                });
                setIsVideoReady(true);
                setIsLoading(false);
            };
        }
    }, [stream, setIsLoading]);

    // Xử lý vẽ video, phân tích tông màu, và vẽ landmarks
    useEffect(() => {
        if (!stream || !canvasRef.current || !displayVideoRef.current || !isVideoReady) {
            console.log(
                "[PersonalColor] Waiting for FaceLandmarker or webcam...");
            return;
        }

        const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setError("Failed to initialize canvas.");
            return;
        }

        const calculateDistance = (
          point1: NormalizedLandmark,
          point2: NormalizedLandmark
        ) => {
          const dx = point2.x - point1.x;
          const dy = point2.y - point1.y;
          return Math.sqrt(dx * dx + dy * dy);
        };
        const drawFaceShape = (landmarks: NormalizedLandmark[]) => {
          const topFace = landmarks[10];
          const bottomFace = landmarks[152];
          const leftFace = landmarks[234];
          const rightFace = landmarks[454];
          // Draw top-left corner L
          ctx.strokeStyle = "aqua";
          ctx.beginPath();
          ctx.lineWidth = 3;
          ctx.moveTo(leftFace.x * canvas.width - 1, topFace.y * canvas.height);
          ctx.lineTo(leftFace.x * canvas.width + 30, topFace.y * canvas.height);
          ctx.moveTo(leftFace.x * canvas.width, topFace.y * canvas.height - 1);
          ctx.lineTo(leftFace.x * canvas.width, topFace.y * canvas.height + 30);
    
          // Draw top-right corner L
          ctx.moveTo(rightFace.x * canvas.width + 1, topFace.y * canvas.height);
          ctx.lineTo(rightFace.x * canvas.width - 30, topFace.y * canvas.height);
          ctx.moveTo(rightFace.x * canvas.width, topFace.y * canvas.height - 1);
          ctx.lineTo(rightFace.x * canvas.width, topFace.y * canvas.height + 30);
    
          // Draw bottom-left corner L
          ctx.moveTo(leftFace.x * canvas.width - 1, bottomFace.y * canvas.height);
          ctx.lineTo(leftFace.x * canvas.width + 30, bottomFace.y * canvas.height);
          ctx.moveTo(leftFace.x * canvas.width, bottomFace.y * canvas.height - 1);
          ctx.lineTo(leftFace.x * canvas.width, bottomFace.y * canvas.height - 30);
    
          // Draw bottom-right corner L
          ctx.moveTo(rightFace.x * canvas.width + 1, bottomFace.y * canvas.height);
          ctx.lineTo(rightFace.x * canvas.width - 30, bottomFace.y * canvas.height);
          ctx.moveTo(rightFace.x * canvas.width, bottomFace.y * canvas.height + 1);
          ctx.lineTo(rightFace.x * canvas.width, bottomFace.y * canvas.height - 30);
          ctx.stroke();
        };
        const drawText = (
          text: string,
          point1: NormalizedLandmark,
          point2: NormalizedLandmark,
          color: string = "black"
        ) => {
          ctx.fillStyle = color;
          ctx.fillText(
            text,
            point1.x * canvas.width +
              (point2.x * canvas.width - point1.x * canvas.width) / 2 -
              5,
            point1.y * canvas.height +
              (point2.y * canvas.height - point1.y * canvas.height) / 2 -
              2
          );
        };
    
        const drawRatioBetweenPoints = (
          point1: NormalizedLandmark,
          point2: NormalizedLandmark,
          point3: NormalizedLandmark,
          point4: NormalizedLandmark,
          color: string
        ) => {
          drawDashedLineBetweenPoints(point1, point2, color);
    
          drawDashedLineBetweenPoints(point3, point4, color);
    
          const point1ToPoint2Distance = calculateDistance(point1, point2);
          const point3ToPoint4Distance = calculateDistance(point3, point4);
          const ratio = point3ToPoint4Distance / point1ToPoint2Distance;
          drawText("1", point1, point2);
          drawText(ratio.toFixed(2), point3, point4);
        };
    
        const calculatePerpendicularDistance = (
          line1Start: NormalizedLandmark,
          line1End: NormalizedLandmark,
          line2Start: NormalizedLandmark,
          line2End: NormalizedLandmark,
          color: string = "black"
        ) => {
          drawDashedLineBetweenPoints(line1Start, line1End, color);
          drawDashedLineBetweenPoints(line2Start, line2End, color);
          const line1Midpoint = {
            x: (line1Start.x + line1End.x) / 2,
            y: (line1Start.y + line1End.y) / 2,
          };
    
          const line2Midpoint = {
            x: (line2Start.x + line2End.x) / 2,
            y: (line2Start.y + line2End.y) / 2,
          };
    
          const dx = line2Midpoint.x - line1Midpoint.x;
          const dy = line2Midpoint.y - line1Midpoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
    
          drawDashedLineBetweenPoints(
            line1Midpoint as NormalizedLandmark,
            line2Midpoint as NormalizedLandmark,
            color
          );
          return { distance, line1Midpoint, line2Midpoint };
        };
    
        const drawDashedLineBetweenPoints = (
          point1: NormalizedLandmark,
          point2: NormalizedLandmark,
          color: string
        ) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]); // Set dashed line pattern
          ctx.beginPath();
          ctx.moveTo(point1.x * canvas.width, point1.y * canvas.height);
          ctx.lineTo(point2.x * canvas.width, point2.y * canvas.height);
          ctx.stroke();
          ctx.setLineDash([]); // Reset to solid line
        };
    
        const drawingFaceGrid = (landmarks: NormalizedLandmark[]) => {
          drawFaceShape(landmarks);
          drawRatioBetweenPoints(
            landmarks[48],
            landmarks[278],
            landmarks[61],
            landmarks[308],
            "red"
          ); // Jawline
    
          drawRatioBetweenPoints(
            landmarks[54],
            landmarks[284],
            landmarks[136],
            landmarks[365],
            "blue"
          ); // Face shape
    
          const {
            distance: d1,
            line1Midpoint: ma1,
            line2Midpoint: ma2,
          } = calculatePerpendicularDistance(
            landmarks[55],
            landmarks[285],
            landmarks[48],
            landmarks[278],
            "orange"
          );
          drawText("1", ma1 as NormalizedLandmark, ma2 as NormalizedLandmark);
    
          const {
            distance: d2,
            line1Midpoint: mb1,
            line2Midpoint: mb2,
          } = calculatePerpendicularDistance(
            landmarks[48],
            landmarks[278],
            landmarks[148],
            landmarks[377],
            "orange"
          );
          drawText(
            (d2 / d1).toFixed(2),
            mb1 as NormalizedLandmark,
            { ...mb2, y: mb2.y - 0.1 } as NormalizedLandmark
          );
        };
    
        const detect = async () => {
          try {
            const now = performance.now();
            const minInterval = detectionResults.face?.faceLandmarks?.length > 0 ? 33 : 100;
            if (now - lastDetectTime.current < minInterval) {
              animationFrameId.current = requestAnimationFrame(detect);
              return;
            }
            lastDetectTime.current = now;
    
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
            if (detectionResults?.face?.faceLandmarks && detectionResults?.face?.faceLandmarks.length > 0) {
              const landmarks = detectionResults?.face?.faceLandmarks[0];
              // analyzeFace(landmarks);
              drawingFaceGrid(landmarks);
            }
          } catch (err) {
            console.error("[CosmeticSurgery] Error during face detection:", err);
          }
    
          animationFrameId.current = requestAnimationFrame(detect);
        };
    
        detect();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [stream, isVideoReady, detectionResults]);

    return (
      <AnalysisLayout
        title="Cosmetic Surgery"
        description="Analyze facial features for cosmetic surgery recommendations."
        videoRef={displayVideoRef}
        canvasRef={canvasRef}
        result={null}
        error={error || webcamError}
      />
    );
}