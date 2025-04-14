// src/pages/PersonalColor.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext"; // Thêm import
import { useHandControl } from "../context/HandControlContext";
import { VIEWS } from "../constants/views";

// Component con để quản lý từng nút
const SelectionButton: React.FC<{
    area: string;
    selectedArea: string | null;
    setSelectedArea: (area: string) => void;
}> = ({ area, selectedArea, setSelectedArea }) => {
    const { registerElement, unregisterElement } = useHandControl();
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const button = buttonRef.current;
        console.log("[SelectionButton] Button ref:", button);
        if (!button) return;
        console.log("[SelectionButton] Button found:", button.dataset.area);

        button.classList.add("hoverable");
        registerElement(button);

        return () => {
            button.classList.remove("hoverable");
            unregisterElement(button);
        };
    }, [registerElement, unregisterElement]);

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
};

export default function PersonalColor() {
    const { stream, error: webcamError, restartStream, handData, setIsHandDetectionEnabled, isTwoFingersRaised } = useWebcam();
    const { setIsLoading } = useLoading(); // Sử dụng context
    const { registerElement, unregisterElement } = useHandControl();
    const [colorTone, setColorTone] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isFaceLandmarkerReady, setIsFaceLandmarkerReady] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [selectedArea, setSelectedArea] = useState<string | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [isFaceDetectionActive, setIsFaceDetectionActive] = useState(true); // Thêm trạng thái chế độ
    const [statusMessage, setStatusMessage] = useState("Face Detection Active"); // Thêm thông báo trạng thái
    const [twoFingersProgress, setTwoFingersProgress] = useState(0); // Thêm tiến trình giơ 2 ngón tay
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const twoFingersStartTime = useRef<number | null>(null);
    const lastInteractionTime = useRef<number>(Date.now());

    // Danh sách khu vực và bảng màu đề xuất
    const areas = ["hair", "lips", "face", "pupil", "eyebrow"];
    const colorPalette = {
        warm: [
            { color: "#FFD700", label: "Best" }, // Vàng ấm
            { color: "#FF4500", label: "Best" }, // Cam cháy
            { color: "#8B0000", label: "Worst" }, // Đỏ đậm
        ],
        cool: [
            { color: "#00CED1", label: "Best" }, // Xanh lam nhạt
            { color: "#FF69B4", label: "Best" }, // Hồng phấn
            { color: "#FFA500", label: "Worst" }, // Cam sáng
        ],
        neutral: [
            { color: "#C0C0C0", label: "Best" }, // Bạc
            { color: "#F5F5DC", label: "Best" }, // Beige
            { color: "#FF0000", label: "Worst" }, // Đỏ tươi
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
            displayVideoRef.current.play().catch((err) => {
                console.error("[PersonalColor] Error playing video:", err);
            });

            const checkVideoReady = () => {
                if (displayVideoRef.current && displayVideoRef.current.readyState >= 4) {
                    setIsVideoReady(true);
                    console.log("[PersonalColor] Display video ready, readyState:", displayVideoRef.current.readyState);
                    setIsLoading(false); // Tắt loading qua context
                } else {
                    setTimeout(checkVideoReady, 500);
                }
            };

            checkVideoReady();
        }
    }, [stream, setIsLoading]);

    // Quản lý chế độ face detection và hand detection
    useEffect(() => {
        if (isFaceDetectionActive) {
            setIsHandDetectionEnabled(false); // Tắt hand detection, chỉ chạy gesture detection
            setStatusMessage("Face Detection Active. Raise two fingers for 2 seconds to use hand control.");
        } else {
            setIsHandDetectionEnabled(true); // Bật hand detection đầy đủ
            setStatusMessage("Hand Control Active. Open hand to return to Home.");
        }
    }, [isFaceDetectionActive, setIsHandDetectionEnabled]);

    // Phát hiện cử chỉ giơ 2 ngón tay trong 2 giây để chuyển sang chế độ hand detection
    useEffect(() => {
        if (isFaceDetectionActive) {
            if (isTwoFingersRaised) {
                if (!twoFingersStartTime.current) {
                    twoFingersStartTime.current = Date.now();
                }
                const elapsed = Date.now() - twoFingersStartTime.current;
                setTwoFingersProgress((elapsed / 2000) * 100);
                if (elapsed >= 2000) {
                    setIsFaceDetectionActive(false);
                    twoFingersStartTime.current = null;
                    setTwoFingersProgress(0);
                }
            } else {
                twoFingersStartTime.current = null;
                setTwoFingersProgress(0);
            }
        }
    }, [isTwoFingersRaised, isFaceDetectionActive]);

    // Tự động quay lại chế độ face detection nếu không có tương tác trong 5 giây
    useEffect(() => {
        if (!isFaceDetectionActive && handData.isHandDetected) {
            lastInteractionTime.current = Date.now();
        }

        const checkInactivity = () => {
            if (!isFaceDetectionActive && Date.now() - lastInteractionTime.current >= 5000) {
                setIsFaceDetectionActive(true);
            }
        };

        const intervalId = setInterval(checkInactivity, 1000);
        return () => clearInterval(intervalId);
    }, [isFaceDetectionActive, handData.isHandDetected]);


    useEffect(() => {
        if (!isFaceLandmarkerReady || !stream || !canvasRef.current || !displayVideoRef.current || !isFaceDetectionActive) {
            console.log("[PersonalColor] Waiting for FaceLandmarker or webcam...", isFaceLandmarkerReady, stream, canvasRef.current, displayVideoRef.current);
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
                    // Video rộng hơn canvas → Fit chiều ngang
                    drawWidth = canvas.width;
                    drawHeight = canvas.width / videoAspect;
                    offsetX = 0;
                    offsetY = (canvas.height - drawHeight) / 2;
                } else {
                    // Video cao hơn canvas → Fit chiều dọc
                    drawHeight = canvas.height;
                    drawWidth = canvas.height * videoAspect;
                    offsetY = 0;
                    offsetX = (canvas.width - drawWidth) / 2;
                }

                ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

                if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                    const landmarks = results.faceLandmarks[0];
                    const foreheadPoint = landmarks[10];
                    const x = foreheadPoint.x * canvas.width;
                    const y = foreheadPoint.y * canvas.height;

                    for (const landmark of landmarks) {
                        const x = landmark.x * canvas.width;
                        const y = landmark.y * canvas.height;

                        ctx.beginPath();
                        ctx.arc(x, y, 2, 0, 2 * Math.PI);
                        ctx.fillStyle = "red";
                        ctx.fill();
                    }

                    if (x >= 10 && y >= 10 && x + 10 <= canvas.width && y + 10 <= canvas.height) {
                        const imageData = ctx.getImageData(x - 10, y - 10, 20, 20);
                        const tone = analyzeColorTone(imageData);
                        setColorTone(tone);
                    } else {
                        setColorTone(null);
                    }
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
    }, [isFaceLandmarkerReady, stream, restartStream]);

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

    const selectionButtons = (
        <div className="flex flex-col gap-6">
            {areas.map((area) => (
                <SelectionButton
                    key={area}
                    area={area}
                    selectedArea={selectedArea}
                    setSelectedArea={setSelectedArea}
                />
            ))}
        </div>
    );

    // Bảng màu (dạng dọc, trong phần 1/3)
    const palette = colorTone ? colorPalette[colorTone.toLowerCase() as keyof typeof colorPalette] : [];
    const colorPaletteElement = (
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
    );


    // Nút hành động
    const actionButtons = (
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
            statusMessage={statusMessage} // Truyền statusMessage
            progress={twoFingersProgress} // Truyền progress
        />
    );
}