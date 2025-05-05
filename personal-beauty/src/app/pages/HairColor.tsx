/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalColor.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
    FilesetResolver,
    ImageSegmenter,
    ImageSegmenterResult
} from "@mediapipe/tasks-vision";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";

export default function HairColor() {
    const {
        stream,
        error: webcamError,
    } = useWebcam();
    const { setIsLoading } = useLoading();
    const [error, setError] = useState<string | null>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const [makeupSuggestion, setMakeupSuggestion] = useState<any | null>(null);
    const [imageSegmenter, setImageSegmenter] = useState<ImageSegmenter | null>(null);
    const prevAvgColorRef = useRef<{ r: number; g: number; b: number } | null>(null);
    const [selectedHairColor, setSelectedHairColor] = useState<number[] | null>(null);
    const lastDetectTime = useRef(0);

    const hairColorList = [
      { name: "Đen tuyền", rgb: [10, 10, 10] },
      { name: "Đen ánh nâu", rgb: [40, 30, 30] },
      { name: "Nâu đen", rgb: [60, 40, 30] },
      { name: "Nâu hạt dẻ", rgb: [90, 60, 40] },
      { name: "Nâu socola", rgb: [120, 80, 60] },
      { name: "Nâu sữa", rgb: [150, 100, 80] },
      { name: "Nâu caramel", rgb: [170, 120, 80] },
      { name: "Nâu sáng", rgb: [200, 140, 90] },
      { name: "Vàng đồng", rgb: [220, 160, 60] },
      { name: "Vàng nghệ", rgb: [255, 197, 0] },
      { name: "Cam sáng", rgb: [255, 130, 60] },
      { name: "Đỏ nâu", rgb: [170, 60, 60] },
      { name: "Đỏ rượu vang", rgb: [120, 30, 50] },
      { name: "Đỏ tím", rgb: [160, 40, 90] },
      { name: "Đỏ tươi", rgb: [220, 40, 60] },
      { name: "Tím ánh đỏ", rgb: [180, 60, 120] },
      { name: "Xám khói", rgb: [180, 180, 180] },
      { name: "Bạch kim", rgb: [245, 245, 245] },
      { name: "Xanh rêu", rgb: [100, 120, 90] },     
      { name: "Xám lạnh", rgb: [130, 130, 130] }       
    ];

    function getNearestHairColorName(r: number, g: number, b: number) {
      let minDistance = Infinity;
      let bestMatch = "Không xác định";
    
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
        const initializeImageSegmenter = async () => {
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
                );

                const segmenter = await ImageSegmenter.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath:
                            "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    outputCategoryMask: true,
                    outputConfidenceMasks: false
                });

                setImageSegmenter(segmenter);
                console.log("[HairColor] ImageSegmenter initialized");
            } catch (err) {
                console.error("[HairColor] Error initializing ImageSegmenter:", err);
                setError("Failed to initialize segmentation.");
            }
        };

        initializeImageSegmenter();

        return () => {
            if (imageSegmenter) {
                imageSegmenter.close();
            }
        };
    }, []);

    useEffect(() => {
        if (stream && displayVideoRef.current) {
            const videoElement = displayVideoRef.current;

            videoElement.pause();
            videoElement.srcObject = stream;

            videoElement
                .play()
                .then(() => {
                    console.log("[PersonalColor] Video is playing.");
                })
                .catch((err) => {
                    console.error("[PersonalColor] Error playing video:", err);
                });

            const checkVideoReady = () => {
                if (videoElement.readyState >= 1) {
                    setIsVideoReady(true);
                    console.log(
                        "[PersonalColor] Display video ready, readyState:",
                        videoElement.readyState
                    );
                    setIsLoading(false);
                } else {
                    setTimeout(checkVideoReady, 500);
                }
            };

            checkVideoReady();
        }
    }, [stream, setIsLoading]);

    useEffect(() => {
        if (!imageSegmenter || !displayVideoRef.current || !canvasRef.current) {
            return;
        }

        const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setError("Failed to initialize canvas.");
            return;
        }

        const detectHair = async () => {
            try {
                const now = performance.now();
                if (now - lastDetectTime.current < 100) { // 10 FPS
                    animationFrameId.current = requestAnimationFrame(detectHair);
                    return;
                }

                lastDetectTime.current = now;
                // Lấy kết quả phân đoạn từ video
                const result: ImageSegmenterResult = await imageSegmenter.segmentForVideo(
                    video,
                    performance.now()
                );

                if (result && result.categoryMask) {
                    const mask = result.categoryMask;
                    const { width, height } = mask;
                    const maskData = mask.getAsUint8Array();

                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    const videoAspect = video.videoWidth / video.videoHeight;
                    const canvasAspect = canvas.width / canvas.height;
    
                    let drawWidth, drawHeight, offsetX, offsetY;
    
                    if (videoAspect > canvasAspect) {
                        drawWidth = canvas.width;
                        drawHeight = canvas.width / videoAspect;
                        offsetX = 0;
                        offsetY = (canvas.height - drawHeight) / 2;
                    } else {
                        drawHeight = canvas.height;
                        drawWidth = canvas.height * videoAspect;
                        offsetY = 0;
                        offsetX = (canvas.width - drawWidth) / 2;
                    }
    
                    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    

                    const imageData = ctx.getImageData(0, 0, width, height);
                    const data = imageData.data;

                    // Lấy tọa độ tóc từ mask và làm trong suốt các pixel không phải tóc
                    for (let i = 0; i < maskData.length; i++) {
                        if (maskData[i] !== 1) { // Giả định 1 đại diện cho tóc trong mask
                            const pixelIndex = i * 4;
                            data[pixelIndex + 3] = 0; // Đặt alpha = 0 cho các pixel không phải tóc
                        }
                    }

                    // // Vẽ lại dữ liệu hình ảnh đã chỉnh sửa lên canvas
                    // ctx.putImageData(imageData, 0, 0);

                    // Lọc ra các pixel thuộc tóc và lưu chỉ số của chúng
                    const hairPixelIndices = [];
                    for (let i = 0; i < maskData.length; i++) {
                        if (maskData[i] === 1) {
                            hairPixelIndices.push(i); // Lưu chỉ số pixel thuộc tóc
                        }
                    }

                    if (selectedHairColor) {
                        for (const i of hairPixelIndices) {
                            const pixelIndex = i * 4;
                            // Áp dụng màu đã chọn vào các pixel thuộc tóc
                            const blendAlpha = 0.5; // 0.0 = không thay đổi, 1.0 = màu mới hoàn toàn
                            data[pixelIndex] = data[pixelIndex] * (1 - blendAlpha) + selectedHairColor[0] * blendAlpha;
                            data[pixelIndex + 1] = data[pixelIndex + 1] * (1 - blendAlpha) + selectedHairColor[1] * blendAlpha;
                            data[pixelIndex + 2] = data[pixelIndex + 2] * (1 - blendAlpha) + selectedHairColor[2] * blendAlpha;
                            data[pixelIndex + 3] = 255;
                        }
                    }
                    
                    // Vẽ lại dữ liệu hình ảnh đã chỉnh sửa lên canvas
                    ctx.putImageData(imageData, 0, 0);

                    // Kiểm tra nếu không có pixel nào thuộc tóc
                    if (hairPixelIndices.length === 0) {
                        setMakeupSuggestion("Không thể phát hiện màu tóc.");
                        return;
                    }

                    // Tính toán màu trung bình của tóc
                    let rTotal = 0, gTotal = 0, bTotal = 0;
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
                    const smoothedR = Math.round(smoothingFactor * prevAvgColor.r + (1 - smoothingFactor) * avgR);
                    const smoothedG = Math.round(smoothingFactor * prevAvgColor.g + (1 - smoothingFactor) * avgG);
                    const smoothedB = Math.round(smoothingFactor * prevAvgColor.b + (1 - smoothingFactor) * avgB);
                    prevAvgColorRef.current = { r: smoothedR, g: smoothedG, b: smoothedB };

                    // Hiển thị kết quả màu tóc
                    const hairColorName = getNearestHairColorName(smoothedR, smoothedG, smoothedB);

                    setMakeupSuggestion(`Màu tóc của bạn là: ${hairColorName}.`);
                  }
            } catch (err) {
                console.error("[HairColor] Lỗi trong quá trình phân đoạn:", err);
            }

            // Lặp lại quá trình phát hiện tóc
            requestAnimationFrame(detectHair);
        };

        detectHair();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [imageSegmenter, selectedHairColor]);

    return (
        <div className="flex flex-col gap-8 h-full min-h-[calc(100vh-2rem)] p-4 md:p-8 overflow-hidden bg-gradient-to-r from-pink-100 to-purple-100">
            {error && (
          <div className="absolute right-0 bg-red-500 text-white p-4 rounded-lg shadow-md text-center max-w-2xl mx-auto">
              {error}
          </div>
            )}
            <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 overflow-hidden">
            <div className="md:w-2/3 px-6 md:px-10 rounded-xl flex flex-col items-center">
                <div className="relative w-full overflow-hidden rounded-2xl shadow-lg border-2 border-gray-200 bg-white" style={{ paddingTop: "75%" /* 480/640 = 0.75 */ }}>
                    <video
                        ref={displayVideoRef}
                        className="absolute inset-0 w-full h-full object-cover"
                        autoPlay
                        playsInline
                        muted
                    />
                    <canvas
                        ref={canvasRef}
                        width={640}
                        height={480}
                        className="absolute inset-0 w-full object-contain pointer-events-none"
                    />
                </div>
            </div>

          <div className="md:w-1/3 bg-white p-4 md:p-6 rounded-xl shadow-md flex flex-col max-h-[calc(100vh-64px)] overflow-hidden">
              <div className="mb-4">
            <h5 className="text-2xl md:text-3xl font-bold text-pink-600">
                Hair Color
            </h5>
            <p className="text-sm md:text-base text-gray-500 mt-2">
                Detect and segment hair regions in video.
            </p>
              </div>
              <hr className="border-gray-200 mb-4" />
              <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4">
            Analysis Result
              </h2>
              {makeupSuggestion ? (
            <p className="text-lg md:text-xl text-gray-700 mb-4">
                Your result is
                <span className="font-bold text-pink-600">
              <div
                  dangerouslySetInnerHTML={{
                __html: `${makeupSuggestion}`,
                  }}
              ></div>
                </span>
                .
            </p>
              ) : (
            <p className="text-lg md:text-xl text-gray-500 animate-pulse mb-4">
                Waiting for analysis...
            </p>
              )}
              <hr className="border-gray-200 mb-4" />
              <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4">
            Choose a Hair Color
              </h2>
              <div className="grid grid-cols-2 gap-4 flex-1 overflow-y-auto">
            {hairColorList.map((color) => (
                <button
              key={color.name}
              className="flex items-center gap-4 p-2 border rounded-lg shadow-sm hover:shadow-md transition-shadow"
              onClick={() => {
                setSelectedHairColor(color.rgb);
              }}
                >
              <div
                  className="w-8 h-8 rounded-full"
                  style={{
                backgroundColor: `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`,
                  }}
              ></div>
              <span className="text-gray-700 font-medium">{color.name}</span>
                </button>
            ))}
              </div>
          </div>
            </div>
        </div>
    );
}