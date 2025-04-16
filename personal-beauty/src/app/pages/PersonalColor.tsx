// src/components/page/PersonalColor.tsx

"use client";

import React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";

// Component con để quản lý từng nút
const SelectionButton = React.memo(
    ({ area, selectedArea, setSelectedArea }: { area: string; selectedArea: string | null; setSelectedArea: (area: string) => void }) => {
        const { registerElement, unregisterElement, isHandDetectionEnabled } = useHandControl();
        const buttonRef = useRef<HTMLButtonElement>(null);
        const isRegistered = useRef(false);

        useEffect(() => {
            const button = buttonRef.current;
            if (!button) return;

            if (isHandDetectionEnabled && !isRegistered.current) {
                //console.log("[SelectionButton] Registering button:", button.dataset.area);
                button.classList.add("hoverable");
                registerElement(button);
                isRegistered.current = true;
            } else if (!isHandDetectionEnabled && isRegistered.current) {
                //console.log("[SelectionButton] Unregistering button:", button.dataset.area);
                button.classList.remove("hoverable");
                unregisterElement(button);
                isRegistered.current = false;
            }

            return () => {
                if (isRegistered.current && button) {
                    //console.log("[SelectionButton] Cleanup - Unregistering button:", button.dataset.area);
                    button.classList.remove("hoverable");
                    unregisterElement(button);
                    isRegistered.current = false;
                }
            };
        }, [registerElement, unregisterElement, isHandDetectionEnabled]);

        return (
            <button
                ref={buttonRef}
                className={`area-button text-2xl font-semibold px-8 py-4 rounded-xl transition-all duration-300 transform shadow-lg ${selectedArea === area
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
    const { stream, error: webcamError, restartStream, handData, setIsHandDetectionEnabled, isIndexFingerRaised } = useWebcam();
    const { setIsLoading } = useLoading();
    const { toggleHandDetection, isHandDetectionEnabled } = useHandControl();
    const [colorTone, setColorTone] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isFaceLandmarkerReady, setIsFaceLandmarkerReady] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [selectedArea, setSelectedArea] = useState<string | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);

    // Danh sách khu vực và bảng màu đề xuất
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

    useEffect(() => {
        const initializeFaceLandmarker = async () => {
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
                );
                const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                        delegate: "GPU",
                    },
                    outputFaceBlendshapes: true,
                    runningMode: "VIDEO",
                    numFaces: 1,
                });

                faceLandmarkerRef.current = faceLandmarker;
                setIsFaceLandmarkerReady(true);
                console.log("[PersonalColor] FaceLandmarker initialized");
            } catch (err) {
                console.error("[PersonalColor] Error initializing FaceLandmarker:", err);
                setError("Failed to initialize face detection.");
            }
        };

        initializeFaceLandmarker();

        return () => {
            if (faceLandmarkerRef.current) {
                faceLandmarkerRef.current.close();
                faceLandmarkerRef.current = null;
            }
            setIsFaceLandmarkerReady(false);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    // Kết nối video stream
    useEffect(() => {
        if (stream && displayVideoRef.current) {
            displayVideoRef.current.srcObject = stream;
            displayVideoRef.current.onloadedmetadata = () => {
                displayVideoRef.current!.play().catch((err) => {
                    console.error("[PersonalColor] Error playing video:", err);
                });
            };

            const checkVideoReady = () => {
                if (displayVideoRef.current && displayVideoRef.current.readyState >= 4) {
                    setIsVideoReady(true);
                    console.log("[PersonalColor] Display video ready, readyState:", displayVideoRef.current.readyState);
                    setIsLoading(false);
                } else {
                    setTimeout(checkVideoReady, 500);
                }
            };

            checkVideoReady();
        }
    }, [stream, setIsLoading]);

    // useEffect(() => {
    //     console.log("[PersonalColor] Hand data updated:", {
    //         isHandDetected: handData.isHandDetected,
    //         isHandDetectionEnabled,
    //         isIndexFingerRaised,
    //     });
    //     if (isHandDetectionEnabled && handData.isHandDetected) {
    //         console.log("[PersonalColor] Hand activity detected");
    //     }
    // }, [isHandDetectionEnabled, handData.isHandDetected, handData.cursorPosition, isIndexFingerRaised]);

    useEffect(() => {
        if (!isFaceLandmarkerReady || !stream || !canvasRef.current || !displayVideoRef.current) {
            console.log(
                "[PersonalColor] Waiting for FaceLandmarker or webcam...",
                isFaceLandmarkerReady,
                stream,
                canvasRef.current,
                displayVideoRef.current
            );
            return;
        }

        const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setError("Failed to initialize canvas.");
            return;
        }

        const waitForVideoReady = async () => {
            let retries = 5;
            while (retries > 0 && video.readyState < 4) {
                console.log("[PersonalColor] Video not ready, waiting... readyState:", video.readyState, "retries left:", retries);
                await new Promise((resolve) => setTimeout(resolve, 2000));
                retries--;
                if (video.readyState < 4) {
                    await restartStream();
                }
            }
            if (video.readyState < 4) {
                setError("Failed to load webcam video for face detection.");
                return false;
            }
            return true;
        };

        const detect = async () => {
            if (!faceLandmarkerRef.current) {
                animationFrameId.current = requestAnimationFrame(detect);
                return;
            }

            const isVideoReady = await waitForVideoReady();
            if (!isVideoReady) {
                return;
            }

            try {
                const results = await faceLandmarkerRef.current.detectForVideo(video, performance.now());

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

                if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                    setColorTone("Warm"); // Giả lập kết quả do logic phân tích màu bị comment
                } else {
                    setColorTone(null);
                }
            } catch (err) {
                console.error("[PersonalColor] Error during face detection:", err);
            }

            animationFrameId.current = requestAnimationFrame(detect);
        };

        detect();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isFaceLandmarkerReady, !!stream, restartStream]);

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
        let h = 0,
            s = 0,
            v = max;

        const d = max - min;
        s = max === 0 ? 0 : d / max;

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

    const selectionButtons = useMemo(
        () => (
            <div className="flex flex-col gap-6">
                {areas.map((area) => (
                    <SelectionButton key={area} area={area} selectedArea={selectedArea} setSelectedArea={setSelectedArea} />
                ))}
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
                            className="color-button w-10 h-10 rounded-full border-2 border-gray-300"
                            style={{ backgroundColor: item.color }}
                            data-color={item.color}
                            onClick={() => setSelectedColor(item.color)}
                        />
                        <span className="text-base font-medium text-gray-700">{item.label}</span>
                    </div>
                ))}
            </div>
        ),
        [palette, setSelectedColor]
    );

    const actionButtons = useMemo(
        () => (
            <>
                <button
                    className="bg-pink-500 text-white px-12 py-6 rounded-lg text-3xl hover:bg-pink-600 transition"
                    onClick={() => {
                        const canvas = canvasRef.current;
                        if (canvas) {
                            const dataUrl = canvas.toDataURL("image/png");
                            const link = document.createElement("a");
                            link.href = dataUrl;
                            link.download = "personal-color-result.png";
                            link.click();
                        }
                    }}
                >
                    Capture
                </button>
            </>
        ),
        []
    );

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
        />
    );
}