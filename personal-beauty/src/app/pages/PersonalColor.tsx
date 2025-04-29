/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/display-name */
// src/components/page/PersonalColor.tsx

"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";
import { VIEWS } from "../constants/views";

const AREA_LANDMARKS: { [key: string]: number[] } = {
  hair: [10, 151, 152, 148, 149],
  lips: [0, 13, 14, 17, 18],
  face: [1, 10, 152, 234, 454],
  pupil: [33, 133, 362, 263],
  eyebrow: [70, 63, 300, 293],
};

const SelectionButton = React.memo(
  ({ area, selectedArea, setSelectedArea }: { area: string; selectedArea: string | null; setSelectedArea: (area: string) => void }) => {
    const { registerElement, unregisterElement, isHandDetectionEnabled } = useHandControl();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const isRegistered = useRef(false);

    useEffect(() => {
      const button = buttonRef.current;
      if (!button) return;

      if (isHandDetectionEnabled && !isRegistered.current) {
        button.classList.add("hoverable");
        registerElement(button);
        isRegistered.current = true;
      } else if (!isHandDetectionEnabled && isRegistered.current) {
        button.classList.remove("hoverable");
        unregisterElement(button);
        isRegistered.current = false;
      }

      return () => {
        if (isRegistered.current && button) {
          button.classList.remove("hoverable");
          unregisterElement(button);
          isRegistered.current = false;
        }
      };
    }, [registerElement, unregisterElement, isHandDetectionEnabled]);

    return (
      <button
        ref={buttonRef}
        className={`area-button text-2xl min-h-[123px] font-semibold px-8 py-4 rounded-xl transition-all duration-300 transform shadow-lg ${
          selectedArea === area
            ? "bg-pink-600 text-white scale-105 border-4 border-pink-300"
            : "bg-gray-200 text-gray-800 hover:bg-gray-300 hover:scale-105"
        }`}
        data-area={area}
        onClick={() => setSelectedArea(area)}
      >
        {area.charAt(0).toUpperCase() + area.slice(1)}
      </button>
    );
  }
);

export default function PersonalColor() {
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
  const [landmarkHistory, setLandmarkHistory] = useState<{ x: number; y: number }[][]>([]);
  const [isFrameStable, setIsFrameStable] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Đang khởi tạo camera...");
  const [progress, setProgress] = useState<number>(0);
  const [noFaceDetectedDuration, setNoFaceDetectedDuration] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef(0);
  const lastDrawTime = useRef(0);
  const lastStableTime = useRef<number | null>(null);

  const STABILITY_THRESHOLD = 5;
  const HISTORY_SIZE = 5;
  const STABILITY_DURATION = 1000;

  const areas = ["hair", "lips", "face", "pupil", "eyebrow"];
  const colorPalette = {
    warm: [
      { color: "#FFD700", label: "Best" },
      { color: "#FF4500", label: "Best" },
      { color: "#8B0000", label: "Worst" },
    ],
    cool: [
      { color: "#00CED1", label: "Best" },
      { color: "#FF69B4", label: "Best" },
      { color: "#FFA500", label: "Worst" },
    ],
    neutral: [
      { color: "#C0C0C0", label: "Best" },
      { color: "#F5F5DC", label: "Best" },
      { color: "#FF0000", label: "Worst" },
    ],
  };

  const selectionButtons = useMemo(
    () => (
      <div className="md:w-2/12 p-1 rounded-xl flex flex-col max-h-[calc(100vh-64px)] overflow-hidden">
        <div className="flex flex-col flex-wrap gap-3 w-full h-full">
          <div className="flex flex-col gap-6">
            {areas.map((area) => (
              <SelectionButton key={area} area={area} selectedArea={selectedArea} setSelectedArea={setSelectedArea} />
            ))}
          </div>
        </div>
      </div>
    ),
    [selectedArea, setSelectedArea]
  );

  const palette = colorTone ? colorPalette[colorTone.toLowerCase() as keyof typeof colorPalette] : [];
  const colorPaletteElement = useMemo(
    () => (
      <div className="flex flex-col gap-3">
        {palette.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <button
              className={`color-button w-10 h-10 rounded-full border-2 transition-transform duration-200 ${
                selectedColor === item.color ? "border-pink-500 scale-110" : "border-gray-300 hover:scale-105"
              }`}
              style={{ backgroundColor: item.color }}
              data-color={item.color}
              onClick={() => {
                setSelectedColor(item.color);
              }}
            />
            <span className="text-base font-medium text-gray-700">{item.label}</span>
          </div>
        ))}
      </div>
    ),
    [palette, selectedColor]
  );

  const actionButtons = useMemo(
    () => (
      <>
        {noFaceDetectedDuration > 30000 && (
          <button
            className="bg-blue-500 text-white px-12 py-6 rounded-lg text-3xl hover:bg-blue-600 transition relative mb-2"
            onClick={async () => {
              setStatusMessage("Đang làm mới camera...");
              setProgress(50);
              await restartStream();
              setStatusMessage("Đang khởi tạo camera...");
              setProgress(20);
              setNoFaceDetectedDuration(0);
            }}
          >
            Làm mới
          </button>
        )}
        <button
          className={`bg-pink-500 text-white px-12 py-6 rounded-lg text-3xl hover:bg-pink-600 transition relative ${
            !colorTone ? "opacity-50 cursor-not-allowed" : ""
          }`}
          disabled={!colorTone}
          onClick={() => {
            if (!colorTone) return;
            const canvas = canvasRef.current;
            if (canvas) {
              setStatusMessage("Đang lưu ảnh...");
              setProgress(80);
              const dataUrl = canvas.toDataURL("image/png");
              const link = document.createElement("a");
              link.href = dataUrl;
              link.download = "personal-color-result.png";
              link.click();
              setTimeout(() => {
                setStatusMessage("Phân tích hoàn tất!");
                setProgress(100);
              }, 500);
            }
          }}
        >
          Capture
        </button>
      </>
    ),
    [colorTone, noFaceDetectedDuration, restartStream]
  );

  useEffect(() => {
    setCurrentView(VIEWS.PERSONAL_COLOR);
  }, []);

  useEffect(() => {
    if (stream && displayVideoRef.current) {
      displayVideoRef.current.srcObject = stream;
      displayVideoRef.current.onloadedmetadata = () => {
        displayVideoRef.current!.play().catch((err) => {
          console.error("[PersonalColor] Error playing video:", err);
        });
        setIsVideoReady(true);
        setIsLoading(false);
        setStatusMessage("Vui lòng giữ yên khuôn mặt để phân tích");
        setProgress(20);
      };
    }
  }, [stream, setIsLoading]);

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
    let h = 0;

    const d = max - min;

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

  const checkFrameStability = (landmarks: { x: number; y: number }[]) => {
    setLandmarkHistory((prev) => {
      const newHistory = [...prev, landmarks].slice(-HISTORY_SIZE);
      
      if (!detectionResults.face?.faceLandmarks) {
        setNoFaceDetectedDuration((prev) => prev + 1000); // Tăng thời gian không phát hiện
        if (noFaceDetectedDuration >= 30000) {
          setStatusMessage("Không phát hiện khuôn mặt trong thời gian dài. Vui lòng làm mới camera.");
        } else {
          setStatusMessage("Không phát hiện khuôn mặt. Vui lòng điều chỉnh vị trí.");
        }
        setProgress(0);
        setIsFrameStable(false);
        return [];
      }

      setNoFaceDetectedDuration(0); // Reset thời gian không phát hiện khi có khuôn mặt

      if (newHistory.length < HISTORY_SIZE) {
        setStatusMessage("Đang thu thập dữ liệu khuôn mặt...");
        setProgress(20);
        return newHistory;
      }

      let maxDeviation = 0;
      for (let i = 1; i < newHistory.length; i++) {
        for (let j = 0; j < landmarks.length; j++) {
          const dx = (newHistory[i][j].x - newHistory[i - 1][j].x) * 640;
          const dy = (newHistory[i][j].y - newHistory[i - 1][j].y) * 480;
          const distance = Math.sqrt(dx * dx + dy * dy);
          maxDeviation = Math.max(maxDeviation, distance);
        }
      }

      const isStable = maxDeviation < STABILITY_THRESHOLD;
      if (isStable && !lastStableTime.current) {
        lastStableTime.current = performance.now();
        setStatusMessage("Đang phân tích tông màu...");
        setProgress(60);
      } else if (isStable && lastStableTime.current && performance.now() - lastStableTime.current >= STABILITY_DURATION) {
        setIsFrameStable(true);
        setStatusMessage("Phân tích hoàn tất!");
        setProgress(100);
      } else if (!isStable) {
        lastStableTime.current = null;
        setIsFrameStable(false);
        setStatusMessage("Vui lòng giữ yên khuôn mặt để phân tích");
        setProgress(20);
      }

      return newHistory;
    });
  };

  useEffect(() => {
    if (!stream || !canvasRef.current || !displayVideoRef.current || !isVideoReady) {
      console.log("[PersonalColor] Waiting for FaceLandmarker or webcam...");
      return;
    }

    const video = displayVideoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Failed to initialize canvas.");
      return;
    }

    let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;

    const draw = async () => {
      const now = performance.now();
      if (now - lastDrawTime.current < 1000) {
        animationFrameId.current = requestAnimationFrame(draw);
        return;
      }
      lastDrawTime.current = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const videoAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = canvas.width / canvas.height;
      if (videoAspect > canvasAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / videoAspect;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * videoAspect;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
      }

      if (detectionResults && detectionResults.face?.faceLandmarks && detectionResults.face?.faceLandmarks.length > 0) {
        const landmarks = detectionResults.face?.faceLandmarks[0];
        checkFrameStability(landmarks);

        if (isFrameStable && selectedArea && AREA_LANDMARKS[selectedArea]) {
          ctx.fillStyle = "red";
          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
          AREA_LANDMARKS[selectedArea].forEach((index) => {
            if (landmarks[index]) {
              const x = landmarks[index].x * drawWidth + offsetX;
              const y = landmarks[index].y * drawHeight + offsetY;
              ctx.beginPath();
              ctx.arc(x, y, 3, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
            }
          });

          const faceLandmarks = AREA_LANDMARKS["face"];
          const xs = faceLandmarks.map((index) => landmarks[index]?.x * drawWidth + offsetX).filter((x) => x !== undefined);
          const ys = faceLandmarks.map((index) => landmarks[index]?.y * drawHeight + offsetY).filter((y) => y !== undefined);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const width = maxX - minX;
          const height = maxY - minY;
          if (width > 0 && height > 0) {
            const imageData = ctx.getImageData(minX, minY, width, height);
            const tone = analyzeColorTone(imageData);
            setColorTone(tone);
          }
        }

        // Vẽ màu được chọn
        if (isFrameStable && selectedColor) {
          ctx.fillStyle = selectedColor;
          ctx.beginPath();
          ctx.arc(50, 50, 20, 0, 2 * Math.PI);
          ctx.fill();
        }
      } else {
        setStatusMessage("Không phát hiện khuôn mặt. Vui lòng điều chỉnh vị trí.");
        setProgress(0);
        setIsFrameStable(false);
        setLandmarkHistory([]);
      }

      animationFrameId.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, isVideoReady, detectionResults, selectedArea, selectedColor]);

  // Theo dõi thời gian không phát hiện khuôn mặt
  useEffect(() => {
    const interval = setInterval(() => {
      if (!detectionResults || !detectionResults.face?.faceLandmarks) {
        setNoFaceDetectedDuration((prev) => prev + 1000);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [detectionResults]);

  return (
    <AnalysisLayout
      title="Personal Color"
      description="Analyze your personal color tone using live video."
      videoRef={displayVideoRef}
      canvasRef={canvasRef}
      result={colorTone}
      error={error || webcamError}
      selectionButtons={selectionButtons}
      colorPalette={colorPaletteElement}
      actionButtons={actionButtons}
      statusMessage={statusMessage}
      progress={progress}
    />
  );
}