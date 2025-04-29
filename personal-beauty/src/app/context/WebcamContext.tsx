// src/app/context/WebcamContext.tsx
// Thêm state mới để theo dõi việc phát hiện tay

"use client";

import React, { RefObject, createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ViewType, VIEWS } from "../constants/views";

// Định nghĩa rõ ràng các kiểu dữ liệu
interface HandData {
  isHandDetected: boolean;
  cursorPosition: { x: number; y: number };
  isFist: boolean;
  isOpenHand: boolean;
}

interface WebcamContextType {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement>;
  error: string | null;
  restartStream: () => Promise<void>;
  handData: HandData;
  setIsHandDetectionEnabled: (enabled: boolean) => void;
  isIndexFingerRaised: boolean;
  isHandDetectionEnabled: boolean;
  detectionResults: { [key: string]: any };
  currentView: string;
  setCurrentView: (view: string) => void;
  cursorRef: RefObject<HTMLDivElement>;
  // Thêm một property mới để kiểm soát face detection và filter
  isHandActive: boolean;
}

// Các hằng số cho xử lý mượt mà
const DETECTION_FPS = 60; // 60fps cho phát hiện tay
const FACE_DETECTION_FPS = 15; // 15fps cho phát hiện mặt
const HAND_DETECTION_INTERVAL = 1000 / DETECTION_FPS;
const FACE_DETECTION_INTERVAL = 1000 / FACE_DETECTION_FPS;

// Hằng số cho phát hiện cử chỉ
const GESTURE_THRESHOLD = 0.045; // Giảm ngưỡng để nhạy hơn
const FIST_THRESHOLD = 0.07; // Ngưỡng phát hiện nắm đấm

// Context mặc định
const WebcamContext = createContext<WebcamContextType | undefined>(undefined);

// Hook sử dụng context
export const useWebcam = () => {
  const context = useContext(WebcamContext);
  if (!context) {
    throw new Error("useWebcam must be used within a WebcamProvider");
  }
  return context;
};

// Provider component tối ưu hóa
export const WebcamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Sử dụng các ref cho dữ liệu performance-critical
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<string>(VIEWS.HOME);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  
  // Worker refs
  const handWorkerRef = useRef<Worker | null>(null);
  const faceWorkerRef = useRef<Worker | null>(null);
  
  // Animation frames
  const handAnimationFrameId = useRef<number | null>(null);
  const faceAnimationFrameId = useRef<number | null>(null);
  
  // Timing refs
  const lastHandDetectTime = useRef(0);
  const lastFaceDetectTime = useRef(0);
  
  // Performance critical data in refs
  const lastPositionBeforeFist = useRef<{ x: number; y: number } | null>(null);
  const smoothPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const handDataRef = useRef<HandData>({
    isHandDetected: false,
    cursorPosition: { x: 0, y: 0 },
    isFist: false,
    isOpenHand: false,
  });
  
  // Settings for smoothing
  const baseAlpha = 0.8; // Tăng từ 0.7 lên 0.8 để giảm độ trễ hơn nữa
  const alphaRef = useRef(baseAlpha);
  
  // States
  const [handData, setHandData] = useState<HandData>({
    isHandDetected: false,
    cursorPosition: { x: 0, y: 0 },
    isFist: false,
    isOpenHand: false,
  });
  const [isHandDetectionEnabled, setIsHandDetectionEnabled] = useState(true); 
  const [isIndexFingerRaised, setIsIndexFingerRaised] = useState(false);
  const [detectionResults, setDetectionResults] = useState<{ [key: string]: any }>({});
  
  // Worker states
  const [isHandWorkerInitialized, setIsHandWorkerInitialized] = useState(false);
  const [isFaceWorkerInitialized, setIsFaceWorkerInitialized] = useState(false);
  
  // Thêm state mới để theo dõi tay có được phát hiện hay không
  const [isHandActive, setIsHandActive] = useState(false);
  
  // Sử dụng useMemo để tránh tính toán lại
  const modelRequirements = useMemo(() => ({
    [VIEWS.PERSONAL_COLOR]: ["hand", "face"],
    [VIEWS.PERSONAL_BODY_TYPE]: ["pose"],
    [VIEWS.HOME]: ["hand"],
    [VIEWS.HAIR_COLOR]: ["hand"],
    [VIEWS.PERSONAL_MAKEUP]: ["hand", "face"],
    [VIEWS.COSMETIC_SURGERY]: ["face", "hand"],
  }), []);

  // Hàm phát hiện cử chỉ tay - tối ưu hóa với useMemo
  const detectGesture = useCallback((landmarks: any[]) => {
    // Tối ưu: Tính toán các điểm chuẩn trực tiếp
    const indexFingerExtension = Math.hypot(landmarks[8].x - landmarks[5].x, landmarks[8].y - landmarks[5].y);
    const middleFingerExtension = Math.hypot(landmarks[12].x - landmarks[9].x, landmarks[12].y - landmarks[9].y);
    const ringFingerExtension = Math.hypot(landmarks[16].x - landmarks[13].x, landmarks[16].y - landmarks[13].y);
    const pinkyExtension = Math.hypot(landmarks[20].x - landmarks[17].x, landmarks[20].y - landmarks[17].y);
    
    // Phát hiện nắm đấm tinh chỉnh - kiểm tra tốt hơn
    const isFist = indexFingerExtension < FIST_THRESHOLD && 
                   middleFingerExtension < FIST_THRESHOLD && 
                   ringFingerExtension < FIST_THRESHOLD && 
                   pinkyExtension < FIST_THRESHOLD;
    
    // Phát hiện bàn tay mở chính xác hơn
    const isOpenHand =
      landmarks[8].y < landmarks[5].y - GESTURE_THRESHOLD &&
      landmarks[12].y < landmarks[9].y - GESTURE_THRESHOLD &&
      landmarks[16].y < landmarks[13].y - GESTURE_THRESHOLD &&
      landmarks[20].y < landmarks[17].y - GESTURE_THRESHOLD;
    
    // Chỉ kiểm tra ngón trỏ
    const isIndexRaised = landmarks[8].y < landmarks[5].y - GESTURE_THRESHOLD;
    
    return { isFist, isOpenHand, isIndexRaised };
  }, []);

  // Tối ưu: Hàm phát hiện và xử lý vị trí con trỏ
  const detectFull = useCallback((landmarks: any[]) => {
    // Phát hiện cử chỉ
    const { isFist, isOpenHand, isIndexRaised } = detectGesture(landmarks);
    
    // Lấy vị trí đầu ngón trỏ
    const indexFingerTip = landmarks[8];
    
    // Tính toán tỷ lệ thực tế
    const videoWidth = videoRef.current?.videoWidth || 640;
    const videoHeight = videoRef.current?.videoHeight || 480;
    const scaleX = window.innerWidth / videoWidth;
    const scaleY = window.innerHeight / videoHeight;
    
    // Điều chỉnh vị trí (đảo ngược trục X cho phản chiếu webcam)
    const adjustedX = (1 - indexFingerTip.x) * videoWidth * scaleX;
    const adjustedY = indexFingerTip.y * videoHeight * scaleY;
    
    // Giới hạn trong màn hình
    const clampedX = Math.max(0, Math.min(adjustedX, window.innerWidth - 1));
    const clampedY = Math.max(0, Math.min(adjustedY, window.innerHeight - 1));

    // Lưu vị trí trước khi nắm đấm nếu trước đó không phải nắm đấm
    if (isFist && !handDataRef.current.isFist) {
      lastPositionBeforeFist.current = { 
        x: smoothPosition.current.x, 
        y: smoothPosition.current.y 
      };
    }

    // Tính khoảng cách di chuyển
    const distance = Math.sqrt(
      Math.pow(clampedX - smoothPosition.current.x, 2) + 
      Math.pow(clampedY - smoothPosition.current.y, 2)
    );
    
    // Alpha động: di chuyển nhanh = ít làm mượt
    const dynamicAlpha = distance > 100 ? 0.95 : 
                         distance > 50 ? 0.9 : 
                         distance > 25 ? 0.85 : baseAlpha;
    
    // Cập nhật ref
    alphaRef.current = dynamicAlpha;
    
    // Tính toán vị trí làm mượt
    const currentPosition = {
      x: Math.round((dynamicAlpha * clampedX + (1 - dynamicAlpha) * smoothPosition.current.x)),
      y: Math.round((dynamicAlpha * clampedY + (1 - dynamicAlpha) * smoothPosition.current.y)),
    };

    // Cập nhật vị trí
    smoothPosition.current = currentPosition;

    // Cập nhật handDataRef
    handDataRef.current = {
      isHandDetected: true,
      cursorPosition: currentPosition,
      isFist,
      isOpenHand,
    };

    // QUAN TRỌNG: Cập nhật trực tiếp DOM cho con trỏ
    if (cursorRef.current) {
      // Sử dụng transform để tối ưu GPU
      cursorRef.current.style.transform = `translate(${currentPosition.x}px, ${currentPosition.y}px)`;
      
      // Thêm hiệu ứng khi nắm đấm
      if (isFist) {
        cursorRef.current.classList.add('fist');
      } else {
        cursorRef.current.classList.remove('fist');
      }
      
      // Thêm hiệu ứng khi bàn tay mở
      // if (isOpenHand) {
      //   cursorRef.current.classList.add('open-hand');
      // } else {
      //   cursorRef.current.classList.remove('open-hand');
      // }
    }

    // Cập nhật state isHandActive khi phát hiện tay
    setIsHandActive(true);

    return handDataRef.current;
  }, [detectGesture, baseAlpha]);

  // Khởi động stream
  const startStream = useCallback(async () => {
    try {
      // Dọn sạch stream cũ nếu có
      if (streamRef.current) {
        console.log("[WebcamProvider] Cleaning up existing stream before starting new one");
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
          console.log(`[WebcamProvider] Track ${track.id} stopped`);
        });
        streamRef.current = null;
      }
      
      // Yêu cầu độ phân giải thấp hơn để tránh quá tải
      const constraints = {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 30, max: 60 }
        }
      };
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log("[WebcamProvider] Stream started with tracks:", mediaStream.getTracks());
      
      // Cập nhật refs và state
      streamRef.current = mediaStream;
      setStream(mediaStream);
      
    } catch (err) {
      console.error("[WebcamProvider] Error accessing webcam:", err);
      setError(`Failed to access webcam: ${(err as Error).message}`);
    }
  }, []);

  // Khởi động lại stream
  const restartStream = useCallback(async () => {
    console.log("[WebcamProvider] Restarting stream...");
    
    // Dừng stream hiện tại
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log(`[WebcamProvider] Track ${track.id} stopped`);
      });
    }
    
    // Reset states
    setStream(null);
    streamRef.current = null;
    
    // Bắt đầu stream mới
    await startStream();
  }, [startStream]);

  // Khởi tạo stream
  useEffect(() => {
    console.log("[WebcamProvider] Initializing webcam...");
    startStream();
    
    // Cleanup khi unmount
    return () => {
      console.log("[WebcamProvider] Cleaning up webcam...");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startStream]);

  // Cập nhật video source khi stream thay đổi
  useEffect(() => {
    if (stream && videoRef.current) {
      console.log("[WebcamProvider] Setting video source...");
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error("[WebcamProvider] Error playing video:", err);
        setError(`Error playing video: ${err.message}`);
      });
    }
  }, [stream]);

  // Đồng bộ handData state với ref
  useEffect(() => {
    // Tối ưu: Cập nhật state ít hơn (chỉ 30 lần/giây) nhưng DOM vẫn mượt 60fps
    let frameCount = 0;
    const updateHandDataState = () => {
      frameCount++;
      
      // Chỉ cập nhật state mỗi 2 frame để giảm re-render
      if (frameCount % 2 === 0) {
        setHandData({...handDataRef.current});
      }
      
      requestAnimationFrame(updateHandDataState);
    };
    
    const rafId = requestAnimationFrame(updateHandDataState);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Khởi tạo workers
  useEffect(() => {
    console.log("[WebcamProvider] Initializing workers...");
    
    // Khởi tạo HandWorker
    try {
      handWorkerRef.current = new Worker(new URL("./HandWorker.ts", import.meta.url));
      handWorkerRef.current.onmessage = (e: MessageEvent) => {
        const { type, results, error: workerError } = e.data;

        if (type === "initialized") {
          console.log("[WebcamProvider] Hand worker initialized");
          setIsHandWorkerInitialized(true);
        }
        
        if (workerError) {
          console.error("[HandWorker] Error:", workerError);
        }
        
        if (type === "detectionResult" && results?.hand) {
          // Phát hiện tay
          if (results.hand.landmarks?.length > 0) {
            const landmarks = results.hand.landmarks[0];
            const detected = detectFull(landmarks);
            setIsIndexFingerRaised(detected.isOpenHand);
            
            // Hiển thị con trỏ khi phát hiện tay
            if (cursorRef.current) {
              cursorRef.current.classList.remove('hidden');
            }
          } else {
            // Không phát hiện tay
            handDataRef.current = {
              ...handDataRef.current,
              isHandDetected: false,
            };
            setIsIndexFingerRaised(false);
            
            // Ẩn con trỏ khi không phát hiện tay
            if (cursorRef.current) {
              cursorRef.current.classList.add('hidden');
            }
            
            // Đặt isHandActive thành false khi không phát hiện tay
            setIsHandActive(false);
          }
          
          // Chỉ cập nhật detection results khi thực sự có thay đổi
          setDetectionResults(prev => {
            // So sánh kết quả mới và cũ
            if (JSON.stringify(prev.hand) !== JSON.stringify(results.hand)) {
              return {
                ...prev,
                hand: results.hand
              };
            }
            return prev;
          });
        }
      };
    } catch (error) {
      console.error("[WebcamProvider] Error creating hand worker:", error);
      setError("Failed to initialize hand detection");
    }

    // Khởi tạo FaceWorker
    try {
      faceWorkerRef.current = new Worker(new URL("./FaceWorker.ts", import.meta.url));
      faceWorkerRef.current.onmessage = (e: MessageEvent) => {
        const { type, results, error: workerError } = e.data;

        if (type === "initialized") {
          console.log("[WebcamProvider] Face worker initialized");
          setIsFaceWorkerInitialized(true);
        }
        
        if (workerError) {
          console.error("[FaceWorker] Error:", workerError);
        }
        
        if (type === "detectionResult" && results?.face) {
          // Chỉ cập nhật detection results khi thực sự có thay đổi
          setDetectionResults(prev => {
            // So sánh kết quả mới và cũ
            if (JSON.stringify(prev.face) !== JSON.stringify(results.face)) {
              return {
                ...prev,
                face: results.face
              };
            }
            return prev;
          });
        }
      };
    } catch (error) {
      console.error("[WebcamProvider] Error creating face worker:", error);
      setError("Failed to initialize face detection");
    }

    // Khởi tạo các worker
    if (handWorkerRef.current) {
      handWorkerRef.current.postMessage({ type: "initialize" });
    }
    
    if (faceWorkerRef.current) {
      faceWorkerRef.current.postMessage({ type: "initialize" });
    }

    return () => {
      // Cleanup các worker
      if (handWorkerRef.current) {
        handWorkerRef.current.postMessage({ type: "cleanup" });
        handWorkerRef.current.terminate();
      }
      if (faceWorkerRef.current) {
        faceWorkerRef.current.postMessage({ type: "cleanup" });
        faceWorkerRef.current.terminate();
      }
    };
  }, [detectFull]);

  // Luồng phát hiện tay
  useEffect(() => {
    if (!stream || !videoRef.current || !handWorkerRef.current || !isHandWorkerInitialized || !isHandDetectionEnabled) {
      return;
    }

    console.log("[WebcamProvider] Starting hand detection loop...");
    const video = videoRef.current;
    
    const handDetect = async () => {
      const now = performance.now();
      
      // Đảm bảo tốc độ khung hình ổn định
      if (now - lastHandDetectTime.current < HAND_DETECTION_INTERVAL) {
        handAnimationFrameId.current = requestAnimationFrame(handDetect);
        return;
      }

      lastHandDetectTime.current = now;

      // Kiểm tra video đã sẵn sàng
      if (video.readyState < 2) {
        handAnimationFrameId.current = requestAnimationFrame(handDetect);
        return;
      }

      try {
        // Tạo bitmap nhỏ hơn để xử lý nhanh hơn - giảm kích thước để tăng FPS
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Giảm kích thước cho xử lý nhanh hơn
        canvas.width = 640;
        canvas.height = 480;
        
        if (ctx) {
          // Vẽ video lên canvas đã thu nhỏ
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Tạo bitmap từ canvas để xử lý nhanh hơn
          const imageBitmap = await createImageBitmap(canvas);
          
          // Gửi đến HandWorker để xử lý
          handWorkerRef.current!.postMessage({
            type: "detect",
            data: {
              imageBitmap,
              timestamp: now
            },
          }, [imageBitmap]);
        }
      } catch (err) {
        console.error("[WebcamProvider] Error creating bitmap for hand detection:", err);
      }

      handAnimationFrameId.current = requestAnimationFrame(handDetect);
    };

    handDetect();

    return () => {
      if (handAnimationFrameId.current) {
        cancelAnimationFrame(handAnimationFrameId.current);
      }
    };
  }, [stream, isHandDetectionEnabled, isHandWorkerInitialized]);

  useEffect(() => {
    const currentModelRequirements = modelRequirements[String(currentView) as ViewType] || [];
    // Chỉ chạy face detection nếu cần
    if (!stream || !videoRef.current || !faceWorkerRef.current || 
        !isFaceWorkerInitialized || !currentModelRequirements.includes("face") || 
        isHandActive) {
      return;
    }
  
    console.log("[WebcamProvider] Starting face detection loop...");
    const video = videoRef.current;
    
    // Đổi từ interval sang setTimeout để có thể kiểm soát thời gian chính xác
    let timeoutId: any = null;
    let isRunningDetection = false; // Biến cờ để tránh chạy chồng chéo
    const DETECTION_INTERVAL = 330; // ~3 FPS - giảm từ 250ms (4FPS) để giảm CPU
    
    // Hàm detect với cơ chế cờ để tránh chạy chồng
    const runDetection = async () => {
      // Nếu đang chạy, không bắt đầu lại
      if (isRunningDetection) return;
      
      isRunningDetection = true;
      
      try {
        // Kiểm tra video đã sẵn sàng chưa
        if (video.readyState < 2) {
          console.log("[WebcamProvider] Video not ready yet");
          scheduleNextRun();
          return;
        }
        
        // Kiểm tra kích thước video
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          console.warn("[WebcamProvider] Video dimensions invalid, skipping detection");
          scheduleNextRun();
          return;
        }
        
        // Sử dụng requestAnimationFrame để tạo canvas trong thời gian nhàn rỗi
        requestAnimationFrame(() => {
          try {
            // Tạo canvas nhỏ hơn để giảm chi phí xử lý
            const canvas = document.createElement('canvas');
            const minWidth = Math.max(160, video.videoWidth / 4); 
            const minHeight = Math.max(120, video.videoHeight / 4);
            
            canvas.width = minWidth;
            canvas.height = minHeight;
            
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
              console.error("[WebcamProvider] Could not get canvas context");
              scheduleNextRun();
              return;
            }
            
            // Vẽ video lên canvas kích thước nhỏ
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Tạo bitmap bất đồng bộ
            createImageBitmap(canvas, 0, 0, canvas.width, canvas.height)
              .then(imageBitmap => {
                // Kiểm tra lại kích thước bitmap
                if (imageBitmap.width <= 0 || imageBitmap.height <= 0) {
                  console.warn("[WebcamProvider] Created bitmap has invalid dimensions");
                  imageBitmap.close();
                  scheduleNextRun();
                  return;
                }
                
                // Gửi đến FaceWorker
                if (faceWorkerRef.current) {
                  faceWorkerRef.current.postMessage({
                    type: "detect",
                    data: {
                      imageBitmap,
                      timestamp: performance.now()
                    },
                  }, [imageBitmap]); // Chuyển quyền sở hữu bitmap
                }
                
                // Lên lịch phát hiện tiếp theo
                scheduleNextRun();
              })
              .catch(err => {
                console.error("[WebcamProvider] Error creating bitmap:", err);
                scheduleNextRun();
              });
          } catch (err) {
            console.error("[WebcamProvider] Error preparing face detection:", err);
            scheduleNextRun();
          }
        });
      } catch (err) {
        console.error("[WebcamProvider] Error in detection cycle:", err);
        scheduleNextRun();
      }
    };
    
    // Lên lịch chạy tiếp theo với thời gian cố định
    const scheduleNextRun = () => {
      isRunningDetection = false;
      timeoutId = setTimeout(runDetection, DETECTION_INTERVAL);
    };
    
    // Bắt đầu vòng lặp phát hiện
    runDetection();
    
    // Cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [stream, currentView, modelRequirements, isFaceWorkerInitialized, isHandActive]);

  // Memoize context value
  const contextValue = useMemo(() => ({
    stream,
    videoRef,
    error,
    restartStream,
    handData,
    setIsHandDetectionEnabled,
    isIndexFingerRaised,
    isHandDetectionEnabled,
    currentView,
    detectionResults,
    setCurrentView,
    cursorRef,
    isHandActive, // Thêm vào context value
  }), [
    stream, 
    error, 
    restartStream, 
    handData, 
    isIndexFingerRaised, 
    isHandDetectionEnabled,
    currentView,
    detectionResults,
    isHandActive // Thêm vào dependencies
  ]);

  return (
    <WebcamContext.Provider value={contextValue as any}>
      {children}
      <video 
        ref={videoRef} 
        className="hidden" 
        playsInline 
        muted
      />
      {/* <div 
        ref={cursorRef}
        className="cursor hidden"
      /> */}
      {/* Thêm CSS cho cursor */}
      <style jsx global>{`
        .hidden {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        
        .cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 24px;
          height: 24px;
          background: rgba(255, 0, 150, 0.5);
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 8px rgba(255, 0, 150, 0.8);
          transition: transform 0.05s cubic-bezier(0.17, 0.67, 0.83, 0.67),
                      width 0.15s ease, height 0.15s ease,
                      background-color 0.2s ease;
          will-change: transform, width, height;
        }
        
        .cursor.fist {
          background: rgba(255, 100, 0, 0.7);
          width: 32px;
          height: 32px;
          box-shadow: 0 0 12px rgba(255, 100, 0, 0.8);
        }
        
        .cursor.open-hand {
          background: rgba(0, 200, 150, 0.7);
          width: 40px;
          height: 40px;
          box-shadow: 0 0 12px rgba(0, 200, 150, 0.8);
        }
      `}</style>
    </WebcamContext.Provider>
  );
};
