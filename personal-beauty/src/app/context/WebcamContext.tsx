// src/context/WebcamContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

interface HandData {
  isHandDetected: boolean;
  cursorPosition: { x: number; y: number };
  isFist: boolean;
  isOpenHand: boolean;
}

interface WebcamContextType {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  error: string | null;
  restartStream: () => Promise<void>;
  handData: HandData;
  setIsHandDetectionEnabled: (enabled: boolean) => void;
  isTwoFingersRaised: boolean; // Thêm để phát hiện cử chỉ giơ 2 ngón tay
}

const WebcamContext = createContext<WebcamContextType | undefined>(undefined);

export const useWebcam = () => {
  const context = useContext(WebcamContext);
  if (!context) {
    throw new Error("useWebcam must be used within a WebcamProvider");
  }
  return context;
};

export const WebcamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const [isHandLandmarkerReady, setIsHandLandmarkerReady] = useState(false);
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef(0);
  const positionHistory = useRef<{ x: number; y: number }[]>([]);
  const HISTORY_SIZE = 5;
  const lastPositionBeforeFist = useRef<{ x: number; y: number } | null>(null);
  const [handData, setHandData] = useState<HandData>({
    isHandDetected: false,
    cursorPosition: { x: 0, y: 0 },
    isFist: false,
    isOpenHand: false,
  });
  const [isHandDetectionEnabled, setIsHandDetectionEnabled] = useState(true);
  const [isTwoFingersRaised, setIsTwoFingersRaised] = useState(false); // State để theo dõi cử chỉ giơ 2 ngón tay

  const startStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setStream(mediaStream);
    } catch (err) {
      console.error("[WebcamProvider] Error accessing webcam:", err);
      setError("Failed to access webcam. Please check your camera permissions.");
    }
  };

  const restartStream = async () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
    await startStream();
  };

  useEffect(() => {
    startStream();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Đảm bảo stream được gán vào videoRef.current
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error("[WebcamProvider] Error playing video:", err);
      });
      console.log("[WebcamProvider] Stream assigned to videoRef.current, stream active:", stream.active);
    }
  }, [stream, videoRef.current]);

  useEffect(() => {
    const initializeHandLandmarker = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        const handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });

        handLandmarkerRef.current = handLandmarker;
        setIsHandLandmarkerReady(true);
        console.log("[WebcamProvider] HandLandmarker initialized");
      } catch (err) {
        console.error("[WebcamProvider] Error initializing HandLandmarker:", err);
        setError("Failed to initialize hand detection. Please refresh the page.");
        setIsHandLandmarkerReady(false);
      }
    };

    initializeHandLandmarker();

    return () => {
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
        handLandmarkerRef.current = null;
      }
      setIsHandLandmarkerReady(false);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isHandLandmarkerReady || !stream || !videoRef.current) {
      console.log("[WebcamProvider] Waiting for HandLandmarker or webcam...", isHandLandmarkerReady, stream, videoRef.current);
      return;
    }

    const video = videoRef.current;
    let retries = 5;
    let hasLoggedReady = false;

    const waitForVideoReady = async () => {
      while (retries > 0 && video.readyState < 4) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
        if (video.readyState < 4) {
          console.log("[WebcamProvider] Video not ready, retrying... readyState:", video.readyState, "retries left:", retries);
          await restartStream();
        }
      }
      if (video.readyState < 4) {
        setError("Failed to load webcam video for hand detection. Please check your camera and refresh the page.");
        return false;
      }

      // Chỉ log một lần khi video sẵn sàng
      if (!hasLoggedReady) {
        console.log("[WebcamProvider] Video ready, readyState:", video.readyState);
        hasLoggedReady = true;
      }
      return true;
    };

    const detectGesture = async () => {
      // Chế độ phát hiện cử chỉ (nhẹ) - chỉ để phát hiện cử chỉ giơ 2 ngón tay
      const now = performance.now();
      if (now - lastDetectTime.current < 100) { // 10 FPS (1000ms / 10 = 100ms)
        animationFrameId.current = requestAnimationFrame(detectGesture);
        return;
      }
      lastDetectTime.current = now;

      if (!handLandmarkerRef.current) {
        console.log("[WebcamProvider] HandLandmarker not initialized, skipping detection...");
        animationFrameId.current = requestAnimationFrame(detectGesture);
        return;
      }

      const isVideoReady = await waitForVideoReady();
      if (!isVideoReady) {
        console.error("[WebcamProvider] Video still not ready after retries.");
        return;
      }

      try {
        const results = await handLandmarkerRef.current.detectForVideo(video, performance.now());
        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          // Phát hiện cử chỉ giơ 2 ngón tay (ngón trỏ và ngón giữa giơ lên, các ngón khác cụp xuống)
          const THRESHOLD = 0.05; // Ngưỡng để đảm bảo ngón tay giơ lên/cụp xuống rõ ràng
          const isIndexRaised = landmarks[8].y < landmarks[5].y - THRESHOLD;
          const isMiddleRaised = landmarks[12].y < landmarks[9].y - THRESHOLD;
          const isRingFolded = landmarks[16].y > landmarks[13].y + THRESHOLD;
          const isPinkyFolded = landmarks[20].y > landmarks[17].y + THRESHOLD;
          const isThumbFolded = landmarks[4].y > landmarks[2].y; // Ngón cái không giơ lên
          const isTwoFingers = isIndexRaised && isMiddleRaised && isRingFolded && isPinkyFolded && isThumbFolded;
          setIsTwoFingersRaised(isTwoFingers);
        } else {
          setIsTwoFingersRaised(false);
        }
      } catch (err) {
        console.error("[WebcamProvider] Error during gesture detection:", err);
        setError("Error during gesture detection. Retrying...");
        await restartStream();
      }

      animationFrameId.current = requestAnimationFrame(detectGesture);
    };

    const detect = async () => {
      const now = performance.now();
      if (now - lastDetectTime.current < 33) { // 30 FPS (1000ms / 30 = 33ms)
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectTime.current = now;

      if (!handLandmarkerRef.current) {
        console.log("[WebcamProvider] HandLandmarker not initialized, skipping detection...");
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }

      const isVideoReady = await waitForVideoReady();
      if (!isVideoReady) {
        console.error("[WebcamProvider] Video still not ready after retries.");
        return;
      }

      try {
        const results = await handLandmarkerRef.current.detectForVideo(video, performance.now());

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const indexFingerTip = landmarks[8];

          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          const scaleX = window.innerWidth / videoWidth;
          const scaleY = window.innerHeight / videoHeight;

          const adjustedX = indexFingerTip.x * videoWidth * scaleX;
          const adjustedY = indexFingerTip.y * videoHeight * scaleY;

          const clampedX = Math.max(0, Math.min(adjustedX, window.innerWidth - 1));
          const clampedY = Math.max(0, Math.min(adjustedY, window.innerHeight - 1));

          const THRESHOLD = 0.05; // Ngưỡng để đảm bảo ngón tay giơ lên/cụp xuống
          const distanceIndex = Math.sqrt(
            Math.pow(landmarks[8].x - landmarks[5].x, 2) +
            Math.pow(landmarks[8].y - landmarks[5].y, 2)
          );
          const distanceMiddle = Math.sqrt(
            Math.pow(landmarks[12].x - landmarks[9].x, 2) +
            Math.pow(landmarks[12].y - landmarks[9].y, 2)
          );
          const isFist = distanceIndex < 0.1 && distanceMiddle < 0.1;
          const isOpenHand = landmarks[4].y < landmarks[2].y - THRESHOLD &&  
                            landmarks[8].y < landmarks[5].y - THRESHOLD &&
                            landmarks[12].y < landmarks[9].y - THRESHOLD &&
                            landmarks[16].y < landmarks[13].y - THRESHOLD &&
                            landmarks[20].y < landmarks[17].y - THRESHOLD;

          let currentPosition: { x: number; y: number };
          if (isFist) {
            if (!lastPositionBeforeFist.current) {
              lastPositionBeforeFist.current = positionHistory.current.length
                ? positionHistory.current[positionHistory.current.length - 1]
                : { x: clampedX, y: clampedY };
            }
            currentPosition = lastPositionBeforeFist.current;
          } else {
            positionHistory.current.push({ x: clampedX, y: clampedY });
            if (positionHistory.current.length > HISTORY_SIZE) {
              positionHistory.current.shift();
            }

            const avgPosition = positionHistory.current.reduce(
              (acc: any, pos: any) => ({
                x: acc.x + pos.x / positionHistory.current.length,
                y: acc.y + pos.y / positionHistory.current.length,
              }),
              { x: 0, y: 0 }
            );
            currentPosition = avgPosition;
            lastPositionBeforeFist.current = null;
          }

          const newHandData = {
            isHandDetected: true,
            cursorPosition: currentPosition,
            isFist,
            isOpenHand,
          };

          // Chỉ gọi setHandData nếu dữ liệu thay đổi
          setHandData((prev: any) => {
            if (
              prev.isHandDetected === newHandData.isHandDetected &&
              prev.cursorPosition.x === newHandData.cursorPosition.x &&
              prev.cursorPosition.y === newHandData.cursorPosition.y &&
              prev.isFist === newHandData.isFist &&
              prev.isOpenHand === newHandData.isOpenHand
            ) {
              return prev; // Không thay đổi, trả về state cũ
            }
            return newHandData; // Có thay đổi, cập nhật state mới
          });
        } else {
          const newHandData = {
            isHandDetected: false,
            cursorPosition: { x: 0, y: 0 },
            isFist: false,
            isOpenHand: false,
          };
          setHandData((prev: any) => {
            if (
              prev.isHandDetected === newHandData.isHandDetected &&
              prev.cursorPosition.x === newHandData.cursorPosition.x &&
              prev.cursorPosition.y === newHandData.cursorPosition.y &&
              prev.isFist === newHandData.isFist &&
              prev.isOpenHand === newHandData.isOpenHand
            ) {
              return prev;
            }
            return newHandData;
          });
        }
      } catch (err) {
        console.error("[WebcamProvider] Error during hand detection:", err);
        setError("Error during hand detection. Retrying...");
        await restartStream();
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    if (isHandDetectionEnabled) {
      detect();
    } else {
      detectGesture();
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isHandLandmarkerReady, stream, isHandDetectionEnabled]);

  return (
    <WebcamContext.Provider value={{ stream, videoRef, error, restartStream, handData, setIsHandDetectionEnabled, isTwoFingersRaised }}>
      {children}
      <video ref={videoRef} className="hidden" />
    </WebcamContext.Provider>
  );
};