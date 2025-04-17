// src/app/context/WebcamContext.tsx

"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { ViewType, VIEWS } from "../constants/views";

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
  isIndexFingerRaised: boolean;
  isHandDetectionEnabled: boolean; // Thêm để đồng bộ
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
  const [currentView, setCurrentView] = useState<string>(VIEWS.HOME);
  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const [isHandLandmarkerReady, setIsHandLandmarkerReady] = useState(false);
  const animationFrameId = useRef<number | null>(null);
  const lightweightFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef(0);
  const lastUpdateTime = useRef(0);
  const lastLightweightDetectTime = useRef(0);
  const positionHistory = useRef<{ x: number; y: number }[]>([]);
  const HISTORY_SIZE = 5;
  const lastPositionBeforeFist = useRef<{ x: number; y: number } | null>(null);
  const [handData, setHandData] = useState<HandData>({
    isHandDetected: false,
    cursorPosition: { x: 0, y: 0 },
    isFist: false,
    isOpenHand: false,
  });
  const [isHandDetectionEnabled, setIsHandDetectionEnabled] = useState(true); // Đặt mặc định là false
  const [isIndexFingerRaised, setIsIndexFingerRaised] = useState(false);
  const [detectionResults, setDetectionResults] = useState<{ [key: string]: any }>({});
  const modelRequirements: { [key: string]: string[] } = {
    [VIEWS.PERSONAL_COLOR]: ["hand", "face"],
    [VIEWS.PERSONAL_BODY_TYPE]: ["pose"],
    [VIEWS.HOME]: ["hand"],
    [VIEWS.HAIR_COLOR]: ["face"],
    [VIEWS.PERSONAL_MAKEUP]: ["face"],
    [VIEWS.COSMETIC_SURGERY]: ["face", "pose"],
  };

  // Hàm chỉ kiểm tra ngón trỏ (dùng cho luồng lightweight detection)
  const detectIndexFinger = useCallback((landmarks: any[]) => {
    const THRESHOLD = 0.05;
    const isIndexRaised = landmarks[8].y < landmarks[5].y - THRESHOLD;
    return isIndexRaised;
  }, []);

  // Hàm kiểm tra cử chỉ tay (dùng cho luồng full detection)
  const detectGesture = useCallback((landmarks: any[]) => {
    const THRESHOLD = 0.1;

    // Kiểm tra nắm tay (fist)
    const distanceIndex = Math.sqrt(
      Math.pow(landmarks[8].x - landmarks[5].x, 2) + Math.pow(landmarks[8].y - landmarks[5].y, 2)
    );
    const distanceMiddle = Math.sqrt(
      Math.pow(landmarks[12].x - landmarks[9].x, 2) + Math.pow(landmarks[12].y - landmarks[9].y, 2)
    );
    const isFist = distanceIndex < 0.1 && distanceMiddle < 0.1;

    // Kiểm tra tay mở (open hand)
    const isOpenHand =
      landmarks[8].y < landmarks[5].y - THRESHOLD &&
      landmarks[12].y < landmarks[9].y - THRESHOLD &&
      landmarks[16].y < landmarks[13].y - THRESHOLD &&
      landmarks[20].y < landmarks[17].y - THRESHOLD;

    // Kiểm tra ngón trỏ giơ ra
    const isIndexRaised = landmarks[8].y < landmarks[5].y - THRESHOLD;

    return { isFist, isOpenHand, isIndexRaised };
  }, []);

  // Hàm phát hiện cử chỉ tay và vị trí con trỏ (dùng cho luồng full detection)
  const detectFull = useCallback(
    (landmarks: any[]) => {
      const { isFist, isOpenHand, isIndexRaised } = detectGesture(landmarks);
      const indexFingerTip = landmarks[8];
      const videoWidth = 320;
      const videoHeight = 240;
      const scaleX = window.innerWidth / videoWidth;
      const scaleY = window.innerHeight / videoHeight;
      const adjustedX = indexFingerTip.x * videoWidth * scaleX;
      const adjustedY = indexFingerTip.y * videoHeight * scaleY;
      const clampedX = Math.max(0, Math.min(adjustedX, window.innerWidth - 1));
      const clampedY = Math.max(0, Math.min(adjustedY, window.innerHeight - 1));

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
          (acc, pos) => ({
            x: acc.x + pos.x / positionHistory.current.length,
            y: acc.y + pos.y / positionHistory.current.length,
          }),
          { x: 0, y: 0 }
        );
        currentPosition = {
          x: Math.round(avgPosition.x * 100) / 100,
          y: Math.round(avgPosition.y * 100) / 100,
        };
        lastPositionBeforeFist.current = null;
      }

      return {
        isHandDetected: true,
        cursorPosition: currentPosition,
        isFist,
        isOpenHand,
        isIndexRaised,
      };
    },
    [detectGesture]
  );

  const startStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
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

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error("[WebcamProvider] Error playing video:", err);
      });
      console.log("[WebcamProvider] Video stream attached to videoRef");
    }
  }, [stream]);

  // useEffect(() => {
  //   if (stream && videoRef.current) {
  //     videoRef.current.srcObject = stream;
  //     videoRef.current.play().catch((err) => {
  //       console.error("[WebcamProvider] Error playing video:", err);
  //     });
  //     console.log("[WebcamProvider] Stream assigned to videoRef.current, stream active:", stream.active);
  //   }
  // }, [stream, videoRef.current]);

  // useEffect(() => {
  //   const initializeHandLandmarker = async () => {
  //     try {
  //       const filesetResolver = await FilesetResolver.forVisionTasks(
  //         "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
  //       );
  //       const handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
  //         baseOptions: {
  //           modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  //           delegate: "GPU",
  //         },
  //         runningMode: "VIDEO",
  //         numHands: 1,
  //       });

  //       handLandmarkerRef.current = handLandmarker;
  //       setIsHandLandmarkerReady(true);
  //       console.log("[WebcamProvider] HandLandmarker initialized");
  //     } catch (err) {
  //       console.error("[WebcamProvider] Error initializing HandLandmarker:", err);
  //       setError("Failed to initialize hand detection. Please refresh the page.");
  //       setIsHandLandmarkerReady(false);
  //     }
  //   };

  //   initializeHandLandmarker();

  //   return () => {
  //     if (handLandmarkerRef.current) {
  //       handLandmarkerRef.current.close();
  //       handLandmarkerRef.current = null;
  //     }
  //     setIsHandLandmarkerReady(false);
  //     if (animationFrameId.current) {
  //       cancelAnimationFrame(animationFrameId.current);
  //     }
  //   };
  // }, []);

  useEffect(() => {
    workerRef.current = new Worker(new URL("./VisionWorker.ts", import.meta.url));

    workerRef.current.onmessage = (e: MessageEvent) => {
      const { type, success, error, modelType, results } = e.data;

      if (type === "initialized") {
        if (!success) {
          setError(`Failed to initialize ${modelType}: ${error}`);
          console.log("[WebcamProvider] Model initialization failed:", modelType, error);
        } else {
          console.log("[WebcamProvider] Model initialized successfully:", modelType);
        }
      }

      if (type === "detectionResult") {
        if (error) {
          setError(`Detection error: ${error}`);
          console.log("[WebcamProvider] Detection error:", error);
          return;
        }

        // console.log("[WebcamProvider] Detection results received:", results);
        setDetectionResults(results);
        if (results.hand && results.hand.landmarks && results.hand.landmarks.length > 0) {
          const landmarks = results.hand.landmarks[0];
          //console.log("[WebcamProvider] Hand landmarks detected:", landmarks);

          const isIndexRaised = detectIndexFinger(landmarks);
          setIsIndexFingerRaised(isIndexRaised);

          // Kích hoạt lại nếu phát hiện tay (không cần đợi ngón trỏ giơ lên)
          if (!isHandDetectionEnabled) {
            console.log("[WebcamProvider] Hand detected in lightweight mode, enabling hand detection");
            setIsHandDetectionEnabled(true);
          }

          if (isHandDetectionEnabled) {
            //console.log("[WebcamProvider] Processing detectFull");
            const { isHandDetected, cursorPosition, isFist, isOpenHand, isIndexRaised: updatedIndexRaised } = detectFull(landmarks);
            setIsIndexFingerRaised(updatedIndexRaised);
            setHandData({
              isHandDetected,
              cursorPosition,
              isFist,
              isOpenHand,
            });
            // console.log("[WebcamProvider] Updated handData (detectFull):", {
            //   isHandDetected,
            //   cursorPosition,
            //   isFist,
            //   isOpenHand,
            //   isIndexRaised: updatedIndexRaised,
            // });
          } else {
            console.log("[WebcamProvider] Processing detectGesture (lightweight mode)");
            const { isFist, isOpenHand, isIndexRaised: updatedIndexRaised } = detectGesture(landmarks);
            setIsIndexFingerRaised(updatedIndexRaised);
            setHandData((prev) => ({
              ...prev,
              isHandDetected: true,
              isFist,
              isOpenHand,
            }));
          }
        } else {
          //console.log("[WebcamProvider] No hand detected in results:", results.hand || "No hand data");
          setIsIndexFingerRaised(false);
          setHandData({
            isHandDetected: false,
            cursorPosition: { x: 0, y: 0 },
            isFist: false,
            isOpenHand: false,
          });
        }

      }

      if (type === "cleaned") {
        console.log("[WebcamProvider] Cleanup completed for model:", modelType);
      }
    };

    workerRef.current.onerror = (error) => {
      console.error("[WebcamProvider] Worker error:", error);
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "cleanup" });
        workerRef.current.terminate();
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (lightweightFrameId.current) {
        cancelAnimationFrame(lightweightFrameId.current);
      }
    };
  }, [isHandDetectionEnabled, detectFull, detectGesture, detectIndexFinger]);

  useEffect(() => {
    if (!workerRef.current) return;

    const requiredModels = modelRequirements[currentView] || ["hand"];
    requiredModels.forEach((modelType) => {
      workerRef.current!.postMessage({ type: "initialize", data: { modelType } });
    });

    const allModels = ["hand", "face", "pose"];
    const unusedModels = allModels.filter((model) => !requiredModels.includes(model));
    unusedModels.forEach((modelType) => {
      workerRef.current!.postMessage({ type: "cleanup", data: { modelType } });
    });

    console.log("[WebcamProvider] Model requirements updated for view:", currentView, requiredModels);
  }, [currentView]);


  // Luồng phát hiện đầy đủ (full detection) khi isHandDetectionEnabled = true
  useEffect(() => {
    if (!stream || !videoRef.current || !workerRef.current || !isHandDetectionEnabled) {
      console.log("[WebcamProvider] Detection loop skipped:", {
        hasStream: !!stream,
        hasVideoRef: !!videoRef.current,
        hasWorker: !!workerRef.current,
        isHandDetectionEnabled
      });
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");

    const detect = () => {
      const now = performance.now();
      if (now - lastDetectTime.current < 50) { // 20 FPS
        // 10 FPS
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectTime.current = now;

      if (!ctx || video.readyState < 4) {
        console.log("[WebcamProvider] Video not ready for detection:", {
          ctxExists: !!ctx,
          videoReadyState: video.readyState,
        });
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const modelTypes = modelRequirements[currentView] || ["hand"];
      workerRef.current!.postMessage(
        {
          type: "detect",
          data: {
            imageData,
            timestamp: now,
            modelTypes,
          },
        },
        [imageData.data.buffer]
      );

      animationFrameId.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, currentView, isHandDetectionEnabled]);

  // Luồng phát hiện nhẹ (lightweight detection) để kích hoạt lại khi isHandDetectionEnabled = false
  useEffect(() => {
    if (!stream || !videoRef.current || !workerRef.current || isHandDetectionEnabled) {
      console.log("[WebcamProvider] Lightweight detection loop skipped:", {
        hasStream: !!stream,
        hasVideoRef: !!videoRef.current,
        hasWorker: !!workerRef.current,
        isHandDetectionEnabled,
      });
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");

    const lightweightDetect = () => {
      const now = performance.now();
      if (now - lastLightweightDetectTime.current < 500) { // 2 FPS
        lightweightFrameId.current = requestAnimationFrame(lightweightDetect);
        return;
      }
      lastLightweightDetectTime.current = now;

      if (!ctx || video.readyState < 4) {
        console.log("[WebcamProvider] Video not ready for lightweight detection:", {
          ctxExists: !!ctx,
          videoReadyState: video.readyState,
        });
        lightweightFrameId.current = requestAnimationFrame(lightweightDetect);
        return;
      }

      console.log("[WebcamProvider] Sending frame to worker (lightweight detection)...");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const modelTypes = ["hand"];
      workerRef.current!.postMessage(
        {
          type: "detect",
          data: {
            imageData,
            timestamp: now,
            modelTypes,
          },
        },
        [imageData.data.buffer]
      );

      lightweightFrameId.current = requestAnimationFrame(lightweightDetect);
    };

    lightweightDetect();

    return () => {
      if (lightweightFrameId.current) {
        cancelAnimationFrame(lightweightFrameId.current);
      }
    };
  }, [stream, isHandDetectionEnabled]);

  return (
    <WebcamContext.Provider
      value={{
        stream,
        videoRef,
        error,
        restartStream,
        handData,
        setIsHandDetectionEnabled,
        isIndexFingerRaised,
        isHandDetectionEnabled, // Truyền ra để đồng bộ
      }}
    >
      {children}
      <video ref={videoRef} className="hidden" />
    </WebcamContext.Provider>
  );
};