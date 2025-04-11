// src/components/HandControlledApp.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import Sidebar from "./Sidebar";

interface HandControlledAppProps {
  children: React.ReactNode;
}

export default function HandControlledApp({ children }: HandControlledAppProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isHandLandmarkerReady, setIsHandLandmarkerReady] = useState(false);

  // Lưu trữ lịch sử vị trí để làm mượt (moving average)
  const positionHistory = useRef<{ x: number; y: number }[]>([]);
  const HISTORY_SIZE = 5; // Số frame để tính trung bình

  // Theo dõi trạng thái "nắm tay" và click
  const lastClickPosition = useRef<{ x: number; y: number } | null>(null);
  const fistDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isClickPending = useRef(false); // Theo dõi xem có click đang chờ không
  const lastFistState = useRef(false); // Theo dõi trạng thái "nắm tay" trước đó
  const lastOpenHandState = useRef(false); // Theo dõi trạng thái "xòe tay" trước đó
  const lastPositionBeforeFist = useRef<{ x: number; y: number } | null>(null); // Lưu vị trí trước khi nắm tay

  // Khởi tạo HandLandmarker
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
      } catch (err) {
        console.error("[HandControlledApp] Error initializing HandLandmarker:", err);
        setError("Failed to initialize hand detection. Please refresh the page.");
      }
    };

    initializeHandLandmarker();
  }, []);

  // Xử lý webcam và hand detection
  useEffect(() => {
    if (!isHandLandmarkerReady || !videoRef.current) {
      console.log("[HandControlledApp] Waiting for HandLandmarker or video element...");
      return;
    }

    const video = videoRef.current;
    let stream: MediaStream | null = null;

    const startWebcam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await video.play();

        const detect = async () => {
          if (!handLandmarkerRef.current) return;

          // Kiểm tra video dimensions
          if (!video.videoWidth || !video.videoHeight) {
            console.log("[HandControlledApp] Video dimensions not ready, skipping frame...");
            requestAnimationFrame(detect);
            return;
          }

          const results = await handLandmarkerRef.current.detectForVideo(video, performance.now());

          if (results.landmarks && results.landmarks.length > 0) {
            setIsHandDetected(true);
            const landmarks = results.landmarks[0];
            const indexFingerTip = landmarks[8];

            // Điều chỉnh ánh xạ tọa độ
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            const scaleX = window.innerWidth / videoWidth;
            const scaleY = window.innerHeight / videoHeight;

            const adjustedX = indexFingerTip.x * videoWidth * scaleX;
            const adjustedY = indexFingerTip.y * videoHeight * scaleY;

            // Đảm bảo tọa độ nằm trong viewport
            const clampedX = Math.max(0, Math.min(adjustedX, window.innerWidth - 1));
            const clampedY = Math.max(0, Math.min(adjustedY, window.innerHeight - 1));

            // Kiểm tra cử chỉ "nắm tay" (fist) bằng khoảng cách Euclidean
            const distanceIndex = Math.sqrt(
              Math.pow(landmarks[8].x - landmarks[5].x, 2) +
              Math.pow(landmarks[8].y - landmarks[5].y, 2)
            );
            const distanceMiddle = Math.sqrt(
              Math.pow(landmarks[12].x - landmarks[9].x, 2) +
              Math.pow(landmarks[12].y - landmarks[9].y, 2)
            );
            const isFist = distanceIndex < 0.1 && distanceMiddle < 0.1;
            console.log("[HandControlledApp] Fist detected:", isFist);

            // Xử lý tọa độ con trỏ
            let currentPosition: { x: number; y: number };
            if (isFist) {
              // Khi nắm tay, giữ con trỏ đứng yên tại vị trí trước đó
              if (!lastFistState.current) {
                // Lưu vị trí ngay trước khi nắm tay
                lastPositionBeforeFist.current = positionHistory.current.length
                  ? positionHistory.current[positionHistory.current.length - 1]
                  : { x: clampedX, y: clampedY };
              }
              currentPosition = lastPositionBeforeFist.current || { x: clampedX, y: clampedY };
            } else {
              // Khi không nắm tay, tiếp tục cập nhật positionHistory và làm mượt
              positionHistory.current.push({ x: clampedX, y: clampedY });
              if (positionHistory.current.length > HISTORY_SIZE) {
                positionHistory.current.shift(); // Xóa vị trí cũ nhất
              }

              const avgPosition = positionHistory.current.reduce(
                (acc: any, pos: any) => ({
                  x: acc.x + pos.x / positionHistory.current.length,
                  y: acc.y + pos.y / positionHistory.current.length,
                }),
                { x: 0, y: 0 }
              );
              currentPosition = avgPosition;
            }

            // Cập nhật cursorPosition để hiển thị con trỏ
            setCursorPosition(currentPosition);

            // Highlight khi di chuyển qua menu
            const elements = document.elementsFromPoint(currentPosition.x, currentPosition.y);
            const menuItem = elements.find((el) => el.classList.contains("menu-item"));

            // Xóa class hover khỏi tất cả các menu-item trước
            document.querySelectorAll(".menu-item").forEach((item) => {
              item.classList.remove("hover");
            });

            // Nếu tìm thấy menu-item, thêm class hover
            if (menuItem) {
              menuItem.classList.add("hover");
            }

            // Xử lý cử chỉ "nắm tay"
            if (isFist && !lastFistState.current && !isClickPending.current) {
              // Phát hiện "nắm tay" (chuyển từ không nắm sang nắm)
              lastFistState.current = true;
              isClickPending.current = true;
              lastClickPosition.current = { x: currentPosition.x, y: currentPosition.y };
              console.log("[HandControlledApp] Last click position:", lastClickPosition.current);

              // Thiết lập timeout cho hành động click
              fistDebounceTimeout.current = setTimeout(() => {
                const element = document.elementFromPoint(
                  lastClickPosition.current!.x,
                  lastClickPosition.current!.y
                );
                console.log("[HandControlledApp] Element at click position:", element);
                if (element?.classList.contains("menu-item")) {
                  const path = element.getAttribute("data-path");
                  console.log("[HandControlledApp] Navigating to path:", path);
                  if (path) {
                    router.push(path);
                  } else {
                    console.log("[HandControlledApp] No path found for menu-item");
                  }
                } else {
                  console.log("[HandControlledApp] No menu-item found at click position");
                }
                isClickPending.current = false; // Reset trạng thái click
              }, 300); // Debounce 300ms
            } else if (!isFist) {
              // Khi thả tay, cập nhật trạng thái
              lastFistState.current = false;

              // Kiểm tra cử chỉ "mở bàn tay" (open hand)
              const isOpenHand = landmarks[8].y < landmarks[5].y && landmarks[12].y < landmarks[9].y;
              console.log("[HandControlledApp] Open hand detected:", isOpenHand);
              if (isOpenHand && !lastOpenHandState.current) {
                // Chỉ gọi router.push("/") khi chuyển từ "không xòe tay" sang "xòe tay"
                lastOpenHandState.current = true;
                router.push("/"); // Quay về trang Home
              } else if (!isOpenHand) {
                lastOpenHandState.current = false;
              }
            }
          } else {
            setIsHandDetected(false);
            // Xóa highlight khi không phát hiện tay
            document.querySelectorAll(".menu-item").forEach((item) => {
              item.classList.remove("hover");
            });
            // Reset trạng thái khi không phát hiện tay
            lastFistState.current = false;
            lastOpenHandState.current = false;
            isClickPending.current = false;
            lastPositionBeforeFist.current = null;
            if (fistDebounceTimeout.current) {
              clearTimeout(fistDebounceTimeout.current);
            }
          }

          requestAnimationFrame(detect);
        };

        detect();
      } catch (err: any) {
        console.error("[HandControlledApp] Error accessing webcam:", err);
        if (err.name === "NotAllowedError") {
          setError("Camera access denied. Please grant permission to use the camera.");
        } else if (err.name === "NotFoundError") {
          setError("No camera found. Please connect a webcam to use this app.");
        } else {
          setError("Failed to access camera. Please check your device and try again.");
        }
      }
    };

    startWebcam();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      handLandmarkerRef.current?.close();
      if (fistDebounceTimeout.current) {
        clearTimeout(fistDebounceTimeout.current);
      }
    };
  }, [isHandLandmarkerReady, router]);

  return (
    <div className="flex min-h-screen bg-gradient-to-r from-pink-100 to-purple-100 overflow-hidden">
      {/* Hiển thị lỗi nếu có */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white p-4 rounded-lg shadow-lg">
          {error}
        </div>
      )}
      {/* Hand Indicator */}
      {isHandDetected && (
        <div
          className="absolute w-8 h-8 rounded-full bg-pink-500 border-4 border-white pointer-events-none z-50"
          style={{
            left: `${(cursorPosition.x / window.innerWidth) * 100}%`,
            top: `${(cursorPosition.y / window.innerHeight) * 100}%`,
          }}
        />
      )}
      {/* Hiển thị video feed để debug */}
      <video ref={videoRef} className="absolute bottom-0 right-0 w-1/4 h-1/4" />
      <Sidebar />
      <main className="flex-1 p-8 overflow-hidden">{children}</main>
    </div>
  );
}