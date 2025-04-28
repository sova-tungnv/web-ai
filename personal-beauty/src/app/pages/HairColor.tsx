/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalColor.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { VIEWS } from "../constants/views";
import { useHandControl } from "../context/HandControlContext";
import AnalysisLayout from "../components/AnalysisLayout";
import HairContent from "../components/hair/HairContent";
import HairResult from "../components/hair/HairResult";
import HairSelection from "../components/hair/HairSelection";

export default function HairColor() {
  const { stream, setCurrentView } = useWebcam();
  const { setIsLoading } = useLoading();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const [makeupSuggestion, setMakeupSuggestion] = useState<any | null>(null);
  const prevAvgColorRef = useRef<{ r: number; g: number; b: number } | null>(
    null
  );
  const selectedHairColor = useRef<number[] | null>(null);
  const lastDetectTime = useRef(0);
  const lastSendDetectTime = useRef(0);
  const [isFaceWorkerInitialized, setIsFaceWorkerInitialized] = useState(false);
  const faceWorkerRef = useRef<Worker | null>(null);
  const ctxRef = useRef<any>(null);
  const isVideoReady = useRef(false);
  const scrollContainerRef: any = useRef(null) ;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hairColorList, _setHairColorList] = useState<any[]>([
    { key: "0", name: "Jet Black", rgb: [10, 10, 10] },
    { key: "1", name: "Soft Black", rgb: [40, 30, 30] },
    { key: "2", name: "Dark Brown", rgb: [60, 40, 30] },
    { key: "3", name: "Chestnut Brown", rgb: [90, 60, 40] },
    { key: "4", name: "Chocolate Brown", rgb: [120, 80, 60] },
    { key: "5", name: "Toffee Brown", rgb: [150, 100, 80] },
    { key: "6", name: "Caramel Brown", rgb: [170, 120, 80] },
    { key: "7", name: "Light Brown", rgb: [200, 140, 90] },
    { key: "8", name: "Golden Bronze", rgb: [220, 160, 60] },
    { key: "9", name: "Golden Yellow", rgb: [255, 197, 0] },
    { key: "10", name: "Copper Orange", rgb: [255, 130, 60] },
    { key: "11", name: "Auburn", rgb: [170, 60, 60] },
    { key: "12", name: "Burgundy", rgb: [120, 30, 50] },
    { key: "13", name: "Mahogany", rgb: [160, 40, 90] },
    { key: "14", name: "Scarlet Red", rgb: [220, 40, 60] },
    { key: "15", name: "Magenta", rgb: [180, 60, 120] },
    { key: "16", name: "Ash Gray", rgb: [180, 180, 180] },
    { key: "17", name: "Platinum Blonde", rgb: [245, 245, 245] },
    { key: "18", name: "Olive Green", rgb: [100, 120, 90] },
    { key: "19", name: "Cool Gray", rgb: [130, 130, 130] },
  ]);
  const [filterHair, setSelectedHair] = useState<any>(null);
  const scrollByAmount = 480;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { registerElement, unregisterElement, isHandDetectionEnabled } = useHandControl();
  const isRegistered = useRef(false);

  useEffect(() => {
    const buttons = buttonRefs.current;
    if (!Array.isArray(buttons) || buttons.length === 0) return;
  
    buttons.forEach((button) => {
      if (!button) return;
  
      if (isHandDetectionEnabled && !isRegistered.current) {
        button.classList.add("hoverable");
        registerElement(button);
      } else if (!isHandDetectionEnabled && isRegistered.current) {
        button.classList.remove("hoverable");
        unregisterElement(button);
      }
    });
  
    isRegistered.current = isHandDetectionEnabled;
  
    return () => {
      if (isRegistered.current) {
        buttons.forEach((button) => {
          if (!button) return;
          button.classList.remove("hoverable");
          unregisterElement(button);
        });
        isRegistered.current = false;
      }
    };
  }, [registerElement, unregisterElement, isHandDetectionEnabled]);

  const handleScrollUp = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current!.scrollBy({ top: -scrollByAmount, behavior: 'smooth' });
    }
  };

  const handleScrollDown = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ top: scrollByAmount, behavior: 'smooth' });
    }
  };


  function getNearestHairColorName(r: number, g: number, b: number) {
    let minDistance = Infinity;
    let bestMatch = "Unknown";

    for (const color of hairColorList) {
      const [cr, cg, cb] = color.rgb;
      const distance = Math.sqrt(
        Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = color.name;
      }
    }

    return bestMatch;
  }

  useEffect(() => {
    setCurrentView(VIEWS.HAIR_COLOR);
  }, []);

  useEffect(() => {
    faceWorkerRef.current = new Worker(
      new URL("../worker/HairWorker.ts", import.meta.url)
    );
    faceWorkerRef.current.onmessage = (e: MessageEvent) => {
      const { type, error, results, success } = e.data;

      if (type === "initialized") {
        if (success) {
          setIsFaceWorkerInitialized(true);
        }
      }

      if (type === "detectionResult") {
        if (error) {
          console.error("[WebcamProvider] Face detection error:", error);
          return;
        }
        detectHair(results);
      }
      if (type === "hairColorChecked") {
        if (error) {
          console.error("[WebcamProvider] Face detection error:", error);
          return;
        }
        prevAvgColorRef.current = results.prevAvgColorRef;
        setMakeupSuggestion(`Your hair color is: ${results.hairColorName}.`);
      }
    };
    faceWorkerRef.current.postMessage({ type: "initialize" });

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (faceWorkerRef.current) {
        faceWorkerRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    const video = displayVideoRef.current;
    if (!stream || !isVideoReady.current || !faceWorkerRef.current || !video || !isFaceWorkerInitialized) {
      return;
    }
    if (!ctxRef.current) {
      ctxRef.current = canvasRef.current?.getContext("2d");
    }
    // Face detection runs at lower frame rate (5 FPS)
    const FACE_DETECTION_INTERVAL = 120;
    const detectFace = async () => {
      const now = performance.now();
      if (now - lastSendDetectTime.current < FACE_DETECTION_INTERVAL) {
        animationFrameId.current = requestAnimationFrame(detectFace);
        return;
      }
      lastSendDetectTime.current = now;
      try {
        const imageBitmap = await createImageBitmap(video);
        faceWorkerRef.current!.postMessage(
          {
            type: "detect",
            data: {
              imageBitmap,
              timestamp: now,
            },
          },
          [imageBitmap]
        );
      } catch (err) {
        console.error(
          "[WebcamProvider] Error creating bitmap for hand detection:",
          err
        );
      }

      animationFrameId.current = requestAnimationFrame(detectFace);
    };

    detectFace();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, isFaceWorkerInitialized]);

  useEffect(() => {
    if (stream && displayVideoRef.current && !isVideoReady.current) {
        displayVideoRef.current.srcObject = stream;
        displayVideoRef.current.onloadedmetadata = () => {
            displayVideoRef.current!.play().then(() => {
                isVideoReady.current = true;
                setIsLoading(false);
            }).catch((err) => {
                console.error("[PersonalColor] Error playing video:", err);
            });
        };
    }
  }, [stream, setIsLoading]);

  const onChangeSelectHair = useCallback((color: any) => {
    selectedHairColor.current = color.rgb;
    setSelectedHair(color.key);
  }, []);

  const detectHair = (result?: any) => {
    try {
      const now = performance.now();
      if (now - lastDetectTime.current < 10) {

        animationFrameId.current = requestAnimationFrame(detectHair);
        return;
      }
      lastDetectTime.current = now;
      if (!canvasRef.current || !displayVideoRef.current) {
        return;
      }

      if (result?.hair) {
        const maskData = result.hair.mask;

        // const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        // Làm sạch canvas trước khi vẽ
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctxRef.current.getImageData(0, 0, result.hair.width, result.hair.height);
        const data = imageData.data;
        const hairPixelIndices = [];
        for (let i = 0; i < maskData.length; i++) {
          if (maskData[i] === 1) {
            hairPixelIndices.push(i); // Lưu chỉ số pixel thuộc tóc
          }
        }
        if (selectedHairColor.current) {
          for (const i of hairPixelIndices) {
            const pixelIndex = i * 4;
            const blendAlpha = 0.5; // Controls RGB blending ratio
            const overlayOpacity = 0.5; // Controls overall opacity (adjust as needed)
        
            // Blend RGB values
            data[pixelIndex] =
              data[pixelIndex] * (1 - blendAlpha) +
              selectedHairColor.current[0] * blendAlpha; // Red
            data[pixelIndex + 1] =
              data[pixelIndex + 1] * (1 - blendAlpha) +
              selectedHairColor.current[1] * blendAlpha; // Green
            data[pixelIndex + 2] =
              data[pixelIndex + 2] * (1 - blendAlpha) +
              selectedHairColor.current[2] * blendAlpha; // Blue
        
            // Set alpha to achieve semi-transparency
            data[pixelIndex + 3] = Math.round(255 * overlayOpacity); // e.g., 50% opacity = 127.5
          }
        }

        ctxRef.current.putImageData(imageData, 0, 0);
        if (hairPixelIndices.length === 0) {
          setMakeupSuggestion("Hair color cannot be detected.");
          return;
        }

        // Tính toán màu trung bình của tóc
        let rTotal = 0,
          gTotal = 0,
          bTotal = 0;
        for (const i of hairPixelIndices) {
          const pixelIndex = i * 4; // Chỉ số trong mảng `data` (RGBA)
          rTotal += data[pixelIndex]; // Tổng giá trị màu đỏ
          gTotal += data[pixelIndex + 1]; // Tổng giá trị màu xanh lá
          bTotal += data[pixelIndex + 2]; // Tổng giá trị màu xanh dương
        }

        // Tính giá trị trung bình cho từng kênh màu
        const pixelCount = hairPixelIndices.length;
        const avgR = Math.round(rTotal / pixelCount);
        const avgG = Math.round(gTotal / pixelCount);
        const avgB = Math.round(bTotal / pixelCount);

        // Làm mượt kết quả qua nhiều khung hình
        const smoothingFactor = 0.8; // Hệ số làm mượt (0.0 - 1.0)
        const prevAvgColor = prevAvgColorRef.current || { r: 0, g: 0, b: 0 };
        const smoothedR = Math.round(
          smoothingFactor * prevAvgColor.r + (1 - smoothingFactor) * avgR
        );
        const smoothedG = Math.round(
          smoothingFactor * prevAvgColor.g + (1 - smoothingFactor) * avgG
        );
        const smoothedB = Math.round(
          smoothingFactor * prevAvgColor.b + (1 - smoothingFactor) * avgB
        );
        prevAvgColorRef.current = { r: smoothedR, g: smoothedG, b: smoothedB };

        // Hiển thị kết quả màu tóc
        const hairColorName = getNearestHairColorName(
          smoothedR,
          smoothedG,
          smoothedB
        );

        setMakeupSuggestion(`Your hair color is: ${hairColorName}.`);
      }
    } catch (err) {
      console.error("[HairColor] Lỗi trong quá trình phân đoạn:", err);
    }

    requestAnimationFrame(detectHair);
  };

  return (
    <div className="flex flex-col gap-8 h-full min-h-[calc(100vh-2rem)] p-4 md:p-8 overflow-hidden bg-gradient-to-r from-pink-100 to-purple-100">
      <div className="flex flex-col md:flex-row gap-3 md:gap-3 flex-1 overflow-hidden">
        <HairContent
          videoRef={displayVideoRef}
          canvasRef={canvasRef}
        />
        <HairSelection
            handleScrollUp={handleScrollUp}
            buttonRefs={buttonRefs}
            scrollContainerRef={scrollContainerRef}
            hairColorList={hairColorList}
            filterHair={filterHair}
            onChangeSelectHair={onChangeSelectHair}
            handleScrollDown={handleScrollDown}
        />
        <HairResult title="Hair Color" description="Detect and segment hair regions in video." makeupSuggestion={makeupSuggestion} />
      </div>
    </div>
  );
}
