/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/display-name */
// src/components/page/PersonalColor.tsx

"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";
import { VIEWS } from "../constants/views";

const AREA_LANDMARKS: { [key: string]: number[] } = {
    face: [1, 10, 152, 234, 454],
    lips: [0, 13, 14, 17, 18],
    pupil: [33, 133, 362, 263],
    eyebrow: [70, 63, 300, 293],
};

// Màu sắc và kiểu dáng cho từng vùng
const AREA_STYLES: { [key: string]: { color: string; glowColor: string } } = {
    face: { color: "#1E90FF", glowColor: "rgba(30, 144, 255, 0.5)" }, // Xanh lam
    lips: { color: "#FF69B4", glowColor: "rgba(255, 105, 180, 0.5)" }, // Hồng
    pupil: { color: "#32CD32", glowColor: "rgba(50, 205, 50, 0.5)" }, // Xanh lá
    eyebrow: { color: "#8A2BE2", glowColor: "rgba(138, 43, 226, 0.5)" }, // Tím
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
                className={`area-button text-2xl min-h-[123px] font-semibold px-8 py-4 rounded-xl transition-all duration-300 transform shadow-lg ${selectedArea === area
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
    const [selectedArea, setSelectedArea] = useState<string | null>("face");
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [landmarkHistory, setLandmarkHistory] = useState<{ x: number; y: number }[][]>([]);
    const [isFrameStable, setIsFrameStable] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>("Initializing camera...");
    const [progress, setProgress] = useState<number>(0);
    const [noFaceDetectedDuration, setNoFaceDetectedDuration] = useState<number>(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const lastDrawTime = useRef(0);
    const lastStableTime = useRef<number | null>(null);
    const lastUnstableTime = useRef<number | null>(null);
    const pulseTime = useRef(0); // Thời gian cho hiệu ứng nhấp nháy

    const STABILITY_THRESHOLD = 15;
    const HISTORY_SIZE = 5;
    const STABILITY_DURATION = 1000;
    const MIN_STABLE_DURATION = 500;

    const areas = ["face", "lips", "pupil", "eyebrow"];
    const colorPalette = {
        warm: [
            { color: "#FFD700", label: "Best for clothing" },
            { color: "#FF4500", label: "Best for makeup" },
            { color: "#8B0000", label: "Avoid for clothing" },
        ],
        cool: [
            { color: "#00CED1", label: "Best for clothing" },
            { color: "#FF69B4", label: "Best for makeup" },
            { color: "#FFA500", label: "Avoid for clothing" },
        ],
        neutral: [
            { color: "#C0C0C0", label: "Best for clothing" },
            { color: "#F5F5DC", label: "Best for makeup" },
            { color: "#FF0000", label: "Avoid for clothing" },
        ],
        lips: [
            { color: "#FF4040", label: "Coral Red" },
            { color: "#C71585", label: "Deep Pink" },
            { color: "#8B008B", label: "Dark Purple" },
            { color: "#FF1493", label: "Hot Pink" },
        ],
        pupil: [
            { color: "#00CED1", label: "Turquoise" },
            { color: "#8B008B", label: "Dark Purple" },
            { color: "#FFD700", label: "Golden" },
            { color: "#A52A2A", label: "Brown" },
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
                            className={`color-button w-10 h-10 rounded-full border-2 transition-transform duration-200 ${selectedColor === item.color ? "border-pink-500 scale-110" : "border-gray-300 hover:scale-105"
                                }`}
                            style={{ backgroundColor: item.color }}
                            data-color={item.color}
                            onClick={() => setSelectedColor(item.color)}
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
                            setStatusMessage("Refreshing camera...");
                            setProgress(50);
                            await restartStream();
                            setStatusMessage("Initializing camera...");
                            setProgress(20);
                            setNoFaceDetectedDuration(0);
                        }}
                    >
                        Refresh
                    </button>
                )}
                <button
                    className={`bg-pink-500 text-white px-12 py-6 rounded-lg text-3xl hover:bg-pink-600 transition relative ${!colorTone ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                    disabled={!colorTone}
                    onClick={() => {
                        if (!colorTone) return;
                        const canvas = canvasRef.current;
                        if (canvas) {
                            setStatusMessage("Saving image...");
                            setProgress(80);
                            const dataUrl = canvas.toDataURL("image/png");
                            const link = document.createElement("a");
                            link.href = dataUrl;
                            link.download = "personal-color-result.png";
                            link.click();
                            setTimeout(() => {
                                setStatusMessage("Analysis completed!");
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
                setStatusMessage("Please keep your face steady for analysis");
                setProgress(20);
            };
        }
    }, [stream, setIsLoading]);

    const drawLandmarkPoint = useCallback((
        ctx: CanvasRenderingContext2D,
        point: { x: number, y: number },
        style: { color: string, glowColor: string },
        pulse: number
    ) => {
        ctx.beginPath();
        ctx.fillStyle = style.color;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 15;
        ctx.shadowColor = style.glowColor;
        const radius = 4 * pulse;
        ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow
    }, []);

    const drawLabel = useCallback((
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        text: string,
        style: { color: string, glowColor: string }
    ) => {
        ctx.font = "16px Arial";
        ctx.fillStyle = style.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = style.glowColor;
        ctx.fillText(text.charAt(0).toUpperCase() + text.slice(1), x, y);
        ctx.shadowBlur = 0;
    }, []);

    const drawConnectingCurve = useCallback((
        ctx: CanvasRenderingContext2D,
        points: { x: number, y: number }[],
        style: { color: string, glowColor: string }
    ) => {
        if (points.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = style.glowColor;

        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }

        ctx.quadraticCurveTo(
            points[points.length - 1].x,
            points[points.length - 1].y,
            points[points.length - 1].x,
            points[points.length - 1].y
        );

        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
    }, []);

    const analyzeColorTone = useCallback((imageData: ImageData): string => {
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
    }, []);

    // Tối ưu hàm kiểm tra độ ổn định khung hình với useCallback
    const checkFrameStability = useCallback((landmarks: { x: number; y: number }[]) => {
        setLandmarkHistory((prev) => {
            const newHistory = [...prev, landmarks].slice(-HISTORY_SIZE);

            if (!detectionResults.face?.faceLandmarks) {
                setNoFaceDetectedDuration((prev) => prev + 1000);
                if (noFaceDetectedDuration >= 30000) {
                    setStatusMessage("Face not detected for a long time. Please refresh the camera.");
                } else {
                    setStatusMessage("Face not detected. Please adjust your position.");
                }
                setProgress(0);
                setIsFrameStable(false);
                return [];
            }

            setNoFaceDetectedDuration(0);

            if (newHistory.length < HISTORY_SIZE) {
                setStatusMessage("Collecting face data...");
                setProgress(20);
                return newHistory;
            }

            let totalDeviation = 0;
            let deviationCount = 0;

            for (let i = 1; i < newHistory.length; i++) {
                for (let j = 0; j < landmarks.length; j++) {
                    const dx = (newHistory[i][j].x - newHistory[i - 1][j].x) * 640;
                    const dy = (newHistory[i][j].y - newHistory[i - 1][j].y) * 480;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    totalDeviation += distance;
                    deviationCount++;
                }
            }

            const averageDeviation = deviationCount > 0 ? totalDeviation / deviationCount : 0;
            const now = performance.now();

            const isStable = averageDeviation < STABILITY_THRESHOLD;

            if (isStable && !lastStableTime.current) {
                lastStableTime.current = now;
                setStatusMessage("Analyzing color tone...");
                setProgress(60);
            } else if (isStable && lastStableTime.current && now - lastStableTime.current >= STABILITY_DURATION) {
                setIsFrameStable(true);
                setStatusMessage("Analysis completed!");
                setProgress(100);
                lastUnstableTime.current = null;
            } else if (!isStable) {
                if (lastStableTime.current && (now - lastStableTime.current < MIN_STABLE_DURATION)) {
                    return newHistory;
                }
                if (!lastUnstableTime.current) {
                    lastUnstableTime.current = now;
                }
                lastStableTime.current = null;
                setIsFrameStable(false);
                setStatusMessage("Please keep your face steady for analysis");
                setProgress(20);
            }

            return newHistory;
        });
    }, [HISTORY_SIZE, STABILITY_THRESHOLD, STABILITY_DURATION, MIN_STABLE_DURATION, detectionResults, noFaceDetectedDuration, setProgress, setStatusMessage]);


     // Tối ưu hàm vẽ chính với useCallback
     const draw = useCallback(async (
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        canvas: HTMLCanvasElement
    ) => {
        const now = performance.now();
        if (now - lastDrawTime.current < 1000 / 60) { // Giới hạn 60 FPS
            animationFrameId.current = requestAnimationFrame(() => draw(ctx, video, canvas));
            return;
        }
        lastDrawTime.current = now;

        // Cập nhật thời gian cho hiệu ứng nhấp nháy
        pulseTime.current += 0.05;
        const pulse = 1 + 0.2 * Math.sin(pulseTime.current); // Hiệu ứng nhấp nháy nhẹ

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Tính toán kích thước vẽ
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = canvas.width / canvas.height;
        let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;
        
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

        if (detectionResults?.face?.faceLandmarks?.length > 0) {
            const landmarks = detectionResults.face.faceLandmarks[0];
            checkFrameStability(landmarks);

            if (isFrameStable && selectedArea && AREA_LANDMARKS[selectedArea]) {
                const points: { x: number; y: number }[] = [];

                // Thu thập tọa độ các điểm landmark
                AREA_LANDMARKS[selectedArea].forEach((index) => {
                    if (landmarks[index]) {
                        const x = landmarks[index].x * drawWidth + offsetX;
                        const y = landmarks[index].y * drawHeight + offsetY;
                        points.push({ x, y });
                    }
                });

                if (points.length > 0) {
                    const style = AREA_STYLES[selectedArea] || { color: "#FFFFFF", glowColor: "rgba(255, 255, 255, 0.5)" };

                    // Vẽ đường cong kết nối các điểm
                    drawConnectingCurve(ctx, points, style);

                    // Vẽ các điểm landmark
                    points.forEach(point => drawLandmarkPoint(ctx, point, style, pulse));

                    // Vẽ nhãn cho vùng đang phân tích
                    drawLabel(ctx, points[0].x + 20, points[0].y - 20, selectedArea, style);
                }

                // Phân tích tông màu dựa trên vùng "face"
                const faceLandmarks = AREA_LANDMARKS["face"];
                const xs = faceLandmarks.map((index) => landmarks[index]?.x * drawWidth + offsetX).filter((x) => x !== undefined);
                const ys = faceLandmarks.map((index) => landmarks[index]?.y * drawHeight + offsetY).filter((y) => y !== undefined);
                
                if (xs.length > 0 && ys.length > 0) {
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
            }

            if (isFrameStable && selectedColor) {
                ctx.fillStyle = selectedColor;
                ctx.beginPath();
                ctx.arc(50, 50, 20, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        animationFrameId.current = requestAnimationFrame(() => draw(ctx, video, canvas));
    }, [detectionResults, isFrameStable, selectedArea, selectedColor, analyzeColorTone, checkFrameStability, drawConnectingCurve, drawLandmarkPoint, drawLabel]);

    useEffect(() => {
        if (!stream || !canvasRef.current || !displayVideoRef.current || !isVideoReady) {
            console.log("[PersonalColor] Waiting for webcam...");
            return;
        }

        const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setError("Failed to initialize canvas.");
            return;
        }

        // Khởi tạo vòng lặp vẽ
        draw(ctx, video, canvas);

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [stream, isVideoReady, draw]);

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
            detectionResults={detectionResults}
            selectionButtons={selectionButtons}
            colorPalette={colorPaletteElement}
            //actionButtons={actionButtons}
            statusMessage={statusMessage}
            progress={progress}
        />
    );
}