/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalMakeup.tsx - Component phân tích và áp dụng makeup đã tối ưu hóa
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NormalizedLandmark } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { VIEWS } from "../constants/views";

type FacialFeatures = {
    eyeDistance: number;
    faceWidth: number;
    faceHeight: number;
    noseWidth: number;
    lipWidth: number;
    browLength: number;
    cheekboneProminence: number;
    faceShape: "round" | "oval" | "square" | "heart" | "long";
    foreheadHeight: number;
    cheekboneHeight: number;
};

type FilterType = "natural" | "glamour" | "soft" | "dramatic" | "nude";

export default function PersonalMakeup() {
    const { 
        stream, 
        error: webcamError, 
        restartStream, 
        detectionResults, 
        setCurrentView, 
        handData,
    } = useWebcam();
    const { setIsLoading } = useLoading();
    const [error, setError] = useState<string | null>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const lastStableTime = useRef<number | null>(null);
    const lastUnstableTime = useRef<number | null>(null);
    const STABILITY_THRESHOLD = 15;
    const HISTORY_SIZE = 5;
    const STABILITY_DURATION = 800; // Thời gian ổn định cần thiết (ms)
    const MIN_STABLE_DURATION = 400; // Thời gian ổn định tối thiểu (ms)
    const [statusMessage, setStatusMessage] = useState<string>("Initializing camera...");
    const [prevStatusMessage, setPrevStatusMessage] = useState<string>("");
    const [isFrameStable, setIsFrameStable] = useState(false);
    const landmarkHistoryRef = useRef<{ x: number; y: number }[][]>([]);
    const [noFaceDetectedDuration, setNoFaceDetectedDuration] = useState<number>(0);
    const [progress, setProgress] = useState<number>(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const [makeupSuggestion, setMakeupSuggestion] = useState<any | null>(null);
    const lastDetectTime = useRef(0);
    const lastAnalysisTime = useRef(0);
    const lastRenderedLandmarks = useRef<NormalizedLandmark[] | null>(null);
    const faceFeaturesCache = useRef<FacialFeatures | null>(null);
    const lastHandDetectedTime = useRef<number>(0);
    const [currentFilter, setCurrentFilter] = useState<FilterType>("natural");
    const lastMakeupRender = useRef<number>(0);
    const MAKEUP_RENDER_INTERVAL = 50; // Giảm thời gian giữa các lần render để làm mượt hơn
    const lastRenderedFilter = useRef<FilterType>(currentFilter);
    const makeupImageRef = useRef<ImageData | null>(null);
    const stableImageCacheRef = useRef<ImageData | null>(null);
    const isRenderingRef = useRef<boolean>(false); // Ngăn render đồng thời
    const filterTransitionRef = useRef<boolean>(false); // Đánh dấu đang chuyển filter
    const renderRequestRef = useRef<boolean>(false); // Để đánh dấu yêu cầu render mới
    const lastRenderRequestTime = useRef<number>(0); // Thời điểm yêu cầu render gần nhất
    const landmarksToRender = useRef<NormalizedLandmark[] | null>(null); // Lưu landmarks cần render
    
    // Đặt view khi component mount
    useEffect(() => {
        setCurrentView(VIEWS.COSMETIC_SURGERY);
        
        // Tạo offscreen canvas với kích thước mặc định ban đầu
        if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
            offscreenCanvasRef.current.width = 640;
            offscreenCanvasRef.current.height = 480;
        }

        // Đảm bảo filter được lưu khi component khởi tạo
        lastRenderedFilter.current = currentFilter;

        return () => {
            // Dọn dẹp
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    // Chuẩn bị đối tượng màu sắc filter cho các kiểu làm đẹp khác nhau
    const filterColors = useMemo(() => ({
        natural: {
            lipColor: "rgba(223, 41, 41, 0.4)",
            lipHighlight: "rgba(255, 255, 255, 0.2)",
            cheekColor: "rgba(211, 34, 11, 0.3)",
            eyebrowColor: "rgba(54, 24, 15, 0.6)",
            eyelinerColor: "rgba(30, 30, 30, 0.8)",
            highlightColor: "rgba(255, 255, 255, 0.2)",
            contourColor: "rgba(80, 40, 40, 0.15)",
            skinColor: "rgba(197, 175, 163, 0.15)",
        },
        glamour: {
            lipColor: "rgba(190, 0, 50, 0.6)",
            lipHighlight: "rgba(255, 180, 180, 0.4)",
            cheekColor: "rgba(255, 20, 50, 0.35)",
            eyebrowColor: "rgba(20, 10, 0, 0.75)",
            eyelinerColor: "rgba(0, 0, 0, 0.95)",
            highlightColor: "rgba(255, 245, 230, 0.3)",
            contourColor: "rgba(60, 30, 30, 0.25)",
            skinColor: "rgba(255, 222, 200, 0.2)",
        },
        soft: {
            lipColor: "rgba(255, 150, 150, 0.4)",
            lipHighlight: "rgba(255, 255, 255, 0.25)",
            cheekColor: "rgba(255, 180, 180, 0.3)",
            eyebrowColor: "rgba(120, 90, 70, 0.5)",
            eyelinerColor: "rgba(90, 60, 60, 0.7)",
            highlightColor: "rgba(255, 255, 255, 0.25)",
            contourColor: "rgba(150, 120, 110, 0.1)",
            skinColor: "rgba(250, 240, 230, 0.2)",
        },
        dramatic: {
            lipColor: "rgba(150, 0, 40, 0.7)",
            lipHighlight: "rgba(255, 100, 100, 0.5)",
            cheekColor: "rgba(180, 40, 40, 0.4)",
            eyebrowColor: "rgba(10, 5, 0, 0.85)",
            eyelinerColor: "rgba(0, 0, 0, 1)",
            highlightColor: "rgba(255, 245, 220, 0.35)",
            contourColor: "rgba(40, 20, 20, 0.35)",
            skinColor: "rgba(240, 210, 190, 0.25)",
        },
        nude: {
            lipColor: "rgba(200, 150, 130, 0.5)",
            lipHighlight: "rgba(255, 240, 230, 0.3)",
            cheekColor: "rgba(210, 170, 140, 0.3)",
            eyebrowColor: "rgba(100, 80, 60, 0.6)",
            eyelinerColor: "rgba(80, 60, 50, 0.7)",
            highlightColor: "rgba(255, 250, 240, 0.25)",
            contourColor: "rgba(150, 120, 100, 0.2)",
            skinColor: "rgba(230, 220, 210, 0.2)",
        }
    }), []);

    // Mô tả cho từng loại filter
    const filterDescriptions = useMemo(() => ({
        natural: "Tự nhiên, nhẹ nhàng tôn lên vẻ đẹp vốn có",
        glamour: "Quyến rũ, nổi bật với son đỏ và eyeliner đậm",
        soft: "Mềm mại, nhẹ nhàng với tông hồng phấn",
        dramatic: "Mạnh mẽ, ấn tượng với tông màu sâu", 
        nude: "Tự nhiên với tông màu nude, phù hợp hàng ngày"
    }), []);

    // Phân tích đặc điểm khuôn mặt từ landmarks
    function analyzeFacialFeatures(landmarks: NormalizedLandmark[]): FacialFeatures {
        const euclidean = (a: any, b: any) =>
            Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const jawLeft = landmarks[234];
        const jawRight = landmarks[454];
        const chin = landmarks[152];
        const forehead = landmarks[10];
        const noseLeft = landmarks[98];
        const noseRight = landmarks[327];
        const browLeft = landmarks[65];
        const browRight = landmarks[295];
        const cheekLeft = landmarks[50];
        const cheekRight = landmarks[280];

        const browCenter = {
            x: (browLeft.x + browRight.x) / 2,
            y: (browLeft.y + browRight.y) / 2,
        };
        const faceWidth = euclidean(jawLeft, jawRight);
        const faceHeight = euclidean(chin, forehead);
        const eyeDistance = euclidean(leftEye, rightEye);
        const noseWidth = euclidean(noseLeft, noseRight);
        const lipWidth = euclidean(landmarks[61], landmarks[291]);
        const browLength = euclidean(browLeft, browRight);
        const cheekboneProminence = euclidean(cheekLeft, cheekRight);
        const foreheadHeight = euclidean(forehead, browCenter);
        const cheekboneHeight =
            euclidean(cheekLeft, leftEye) / euclidean(chin, cheekLeft);

        let faceShape: FacialFeatures["faceShape"] = "oval";
        const ratio = faceHeight / faceWidth;
        if (ratio > 1.5) faceShape = "long";
        else if (ratio > 1.3) faceShape = "oval";
        else if (ratio < 1.1) faceShape = "square";
        else if (cheekboneProminence > faceWidth * 0.9) faceShape = "heart";
        else faceShape = "round";

        return {
            eyeDistance,
            faceWidth,
            faceHeight,
            noseWidth,
            lipWidth,
            browLength,
            cheekboneProminence,
            faceShape,
            cheekboneHeight,
            foreheadHeight,
        };
    }

    // Tạo gợi ý makeup dựa trên đặc điểm khuôn mặt
    function generateMakeupSuggestion(features: FacialFeatures): string {
        const suggestions: string[] = [];

        // Thêm mô tả filter hiện tại
        suggestions.push(
            `<div style="margin-bottom: 10px; padding: 10px; background: rgba(255,182,193,0.2); border-radius: 8px;">
                <strong style="font-size: 1em; color: #d64161;">💄 Filter hiện tại: ${currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)}</strong>
                <p style="margin: 5px 0 0; font-size: 0.9em;">${filterDescriptions[currentFilter]}</p>
            </div>`
        );

        // Nhận xét hình dáng khuôn mặt
        switch (features.faceShape) {
            case "round":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt của bạn tròn với đường nét mềm mại</strong> <br/><em style="font-size: 17px;">💄 Nên tạo khối nhẹ ở hai bên má và xương hàm để tạo cảm giác thon gọn</em>`
                );
                break;
            case "oval":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt của bạn hình oval, tỉ lệ rất cân đối</strong> <br/>💄<em style="font-size: 17px;"> Chỉ cần nhấn nhẹ vào các đường nét để tôn lên vẻ đẹp tự nhiên </em>`
                );
                break;
            case "square":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt của bạn vuông với đường hàm rõ nét</strong> <br/>💄<em style="font-size: 17px;"> Hãy dùng highlight ở trán và cằm để làm mềm đường nét khuôn mặt</em>`
                );
                break;
            case "heart":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt bạn hình trái tim, trán rộng, cằm nhỏ</strong> <br/>💄<em style="font-size: 17px;"> Nên tập trung highlight vùng trán và tạo khối nhẹ cho phần cằm</em>`
                );
                break;
            case "long":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt bạn khá dài, thanh thoát</strong> <br/>💄<em style="font-size: 17px;"> Dùng má hồng tán ngang để giúp khuôn mặt trông cân đối hơn</em>`
                );
                break;
        }

        // Khoảng cách mắt
        if (features.eyeDistance > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Đôi mắt bạn khá to và cách xa nhau</strong> <br/>💄<em style="font-size: 17px;"> Nên kẻ eyeliner đậm và chuốt mascara kỹ phần khóe mắt trong để thu hẹp khoảng cách</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Đôi mắt bạn nhỏ hoặc gần nhau</strong> <br/>💄<em style="font-size: 17px;">Ưu tiên eyeliner mảnh và phấn mắt sáng để mở rộng đôi mắt</em>`
            );
        }

        // Môi
        if (features.lipWidth > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 Bạn có đôi môi đầy đặn </strong><br/> 💄<em style="font-size: 17px;"> Hãy dùng son lì hoặc màu trầm để tạo cảm giác hài hòa hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 Môi bạn khá nhỏ gọn </strong><br/> 💄<em style="font-size: 17px;"> Sử dụng son bóng hoặc tông màu tươi sáng để giúp môi trông căng mọng hơn.</em>`
            );
        }

        // Mũi
        if (features.noseWidth > 0.07) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Mũi của bạn hơi rộng </strong><br/> 💄<em style="font-size: 17px;"> Tạo khối nhẹ hai bên sống mũi để tạo hiệu ứng thon gọn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Mũi bạn thon gọn </strong><br/> 💄<em style="font-size: 17px;"> Hãy tô chút highlight dọc sống mũi để tăng chiều sâu và nổi bật.</em>`
            );
        }

        // Lông mày
        if (features.browLength < features.eyeDistance * 1.5) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️‍🗨️ Lông mày bạn ngắn và nhẹ </strong><br/> 💄<em style="font-size: 17px;"> Nên kẻ dài thêm một chút và tạo độ cong nhẹ để gương mặt hài hòa hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️‍🗨️ Lông mày bạn khá dài và rõ nét </strong><br/> 💄<em style="font-size: 17px;"> Chỉ cần giữ dáng tự nhiên, không nên tô quá sắc để tránh làm khuôn mặt cứng.</em>`
            );
        }

        // Gò má
        if (features.cheekboneHeight < 0.4) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">😊 Gò má bạn cao </strong><br/> 💄<em style="font-size: 17px;"> Hãy đánh má hồng thấp hơn xương gò má và tán ngang để làm dịu đường nét.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">😊 Gò má bạn thấp </strong><br/> 💄<em style="font-size: 17px;"> Nên tán má hồng cao và kéo dài lên thái dương để tạo hiệu ứng nâng mặt.</em>`
            );
        }

        // Đường chân tóc
        if (features.foreheadHeight > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🔍 Trán bạn cao </strong><br/> 💄<em style="font-size: 17px;"> Dùng phấn tối màu sát chân tóc để tạo cảm giác trán thấp hơn và mềm mại hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🔍 Trán bạn thấp </strong><br/> 💄<em style="font-size: 17px;"> Có thể chải tóc ra sau hoặc highlight vùng trán để khuôn mặt cân đối hơn.</em>`
            );
        }

        // Thêm UI lựa chọn filter với nút nhấn
        suggestions.push(`
            <div style="margin-top: 15px; padding: 10px; background: rgba(255,182,193,0.1); border-radius: 8px;">
                <strong style="font-size: 0.9em;">🎨 Thử các phong cách makeup khác:</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px;">
                    <button data-filter="natural" style="padding: 8px 12px; border-radius: 20px; border: none; background: ${currentFilter === 'natural' ? '#d64161' : '#f8d0d8'}; color: ${currentFilter === 'natural' ? 'white' : '#333'}; cursor: pointer; font-size: 14px;">Tự nhiên</button>
                    <button data-filter="glamour" style="padding: 8px 12px; border-radius: 20px; border: none; background: ${currentFilter === 'glamour' ? '#d64161' : '#f8d0d8'}; color: ${currentFilter === 'glamour' ? 'white' : '#333'}; cursor: pointer; font-size: 14px;">Quyến rũ</button>
                    <button data-filter="soft" style="padding: 8px 12px; border-radius: 20px; border: none; background: ${currentFilter === 'soft' ? '#d64161' : '#f8d0d8'}; color: ${currentFilter === 'soft' ? 'white' : '#333'}; cursor: pointer; font-size: 14px;">Mềm mại</button>
                    <button data-filter="dramatic" style="padding: 8px 12px; border-radius: 20px; border: none; background: ${currentFilter === 'dramatic' ? '#d64161' : '#f8d0d8'}; color: ${currentFilter === 'dramatic' ? 'white' : '#333'}; cursor: pointer; font-size: 14px;">Ấn tượng</button>
                    <button data-filter="nude" style="padding: 8px 12px; border-radius: 20px; border: none; background: ${currentFilter === 'nude' ? '#d64161' : '#f8d0d8'}; color: ${currentFilter === 'nude' ? 'white' : '#333'}; cursor: pointer; font-size: 14px;">Nude</button>
                </div>
            </div>
        `);

        return suggestions.join("<br/>");
    }

    // Kết nối video stream
    useEffect(() => {
        if (stream && displayVideoRef.current) {
            displayVideoRef.current.srcObject = stream;
            displayVideoRef.current.onloadedmetadata = () => {
                displayVideoRef.current!.play().catch((err: any) => {
                    console.error("[PersonalMakeup] Error playing video:", err);
                });
                setIsVideoReady(true);
                
                // Cập nhật kích thước offscreen canvas khi video đã sẵn sàng
                if (offscreenCanvasRef.current && displayVideoRef.current) {
                    offscreenCanvasRef.current.width = displayVideoRef.current.videoWidth;
                    offscreenCanvasRef.current.height = displayVideoRef.current.videoHeight;
                }
                
                // Cập nhật kích thước canvas chính khi video đã sẵn sàng
                if (canvasRef.current && displayVideoRef.current) {
                    canvasRef.current.width = displayVideoRef.current.videoWidth;
                    canvasRef.current.height = displayVideoRef.current.videoHeight;
                }
                
                setIsLoading(false);
                setStatusMessage("Please keep your face steady for analysis");
                setProgress(20);
            };
        }
    }, [stream, setIsLoading]);

    // Xử lý sự kiện bấm nút chọn filter
    useEffect(() => {
        // Thêm event listener để phát hiện khi người dùng nhấn nút chọn filter
        const handleFilterClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'BUTTON' && target.dataset.filter) {
                const filterName = target.dataset.filter as FilterType;
                
                // Nếu đang chọn filter hiện tại, không làm gì cả
                if (filterName === currentFilter) return;
                
                // Đánh dấu đang trong quá trình chuyển filter
                filterTransitionRef.current = true;
                
                // Xóa cache makeup để buộc vẽ lại
                makeupImageRef.current = null;
                
                // Cập nhật filter mới
                setCurrentFilter(filterName);
                
                // Lưu filter mới ngay lập tức vào ref
                lastRenderedFilter.current = filterName;
                
                // Yêu cầu render ngay
                renderRequestRef.current = true;
                lastRenderRequestTime.current = performance.now();
                
                // Cập nhật lại gợi ý makeup nếu có đặc điểm khuôn mặt
                if (faceFeaturesCache.current) {
                    const suggestion = generateMakeupSuggestion(faceFeaturesCache.current);
                    setMakeupSuggestion(suggestion);
                }
                
                // Kết thúc quá trình chuyển filter sau 300ms
                setTimeout(() => {
                    filterTransitionRef.current = false;
                }, 300);
            }
        };
        
        document.addEventListener('click', handleFilterClick);
        
        return () => {
            document.removeEventListener('click', handleFilterClick);
        };
    }, [currentFilter]);

    // Cải tiến hàm kiểm tra ổn định frame với thuật toán chống nhấp nháy
    const checkFrameStability = useCallback((landmarks: { x: number; y: number }[]) => {
        const now = performance.now();
        
        // Nếu đang trong quá trình chuyển filter, xem như frame ổn định
        if (filterTransitionRef.current) {
            return true; // Trả về true để cho biết frame ổn định
        }
        
        // Nếu phát hiện tay, lưu lại trạng thái trước đó nhưng không thay đổi trạng thái hiện tại
        if (handData.isHandDetected) {
            // Lưu thời gian phát hiện tay
            lastHandDetectedTime.current = now;
            return isFrameStable; // Giữ nguyên trạng thái ổn định hiện tại
        }
        
        // Kiểm tra xem có face landmarks không
        if (!detectionResults.face?.faceLandmarks) {
            setNoFaceDetectedDuration((prev) => prev + 1000);
            if (noFaceDetectedDuration >= 30000) {
                setStatusMessage("Face not detected for a long time. Please refresh the camera.");
            } else {
                setStatusMessage("Face not detected. Please adjust your position.");
                setPrevStatusMessage("Face not detected. Please adjust your position.");
            }
            setProgress(0);
            setIsFrameStable(false);
            landmarkHistoryRef.current = []; // reset
            return false;
        }
    
        setNoFaceDetectedDuration(0);
    
        // Thêm landmarks vào lịch sử và giới hạn kích thước
        const newHistory = [...landmarkHistoryRef.current, landmarks].slice(-HISTORY_SIZE);
    
        if (newHistory.length < HISTORY_SIZE) {
            setStatusMessage("Collecting face data...");
            setPrevStatusMessage("Collecting face data...");
            setProgress(20);
            landmarkHistoryRef.current = newHistory;
            return false;
        }
    
        // Tính toán độ lệch trung bình giữa các frame liên tiếp - tối ưu hóa
        let totalDeviation = 0;
        
        // Chỉ kiểm tra một số điểm quan trọng để tăng hiệu suất
        const keyPointIndices = [8, 33, 263, 61, 291]; // Mũi, mắt, môi
        
        for (let i = 1; i < newHistory.length; i++) {
            for (const idx of keyPointIndices) {
                if (idx < landmarks.length) {
                    const dx = (newHistory[i][idx].x - newHistory[i - 1][idx].x) * 640;
                    const dy = (newHistory[i][idx].y - newHistory[i - 1][idx].y) * 480;
                    totalDeviation += Math.sqrt(dx * dx + dy * dy);
                }
            }
        }
    
        const averageDeviation = totalDeviation / (keyPointIndices.length * (newHistory.length - 1));
        
        // Thêm hysteresis để tránh trạng thái nhấp nháy
        const isCurrentlyStable = isFrameStable;
        const isStable = isCurrentlyStable 
            ? averageDeviation < (STABILITY_THRESHOLD * 1.2)  // Cần lệch nhiều hơn để mất ổn định
            : averageDeviation < (STABILITY_THRESHOLD * 0.8); // Cần lệch ít hơn để trở nên ổn định
        
        // Xử lý logic trạng thái ổn định
        if (isStable && !lastStableTime.current) {
            // Chuyển sang trạng thái ổn định
            lastStableTime.current = now;
            setStatusMessage("Analyzing face...");
            setPrevStatusMessage("Analyzing face...");
            setProgress(60);
        } else if (isStable && lastStableTime.current && now - lastStableTime.current >= STABILITY_DURATION) {
            // Xác nhận đã ổn định đủ lâu
            if (!isFrameStable) {
                setIsFrameStable(true);
                setStatusMessage("Analysis completed!");
                setPrevStatusMessage("Analysis completed!");
                setProgress(100);
            }
            lastUnstableTime.current = null;
        } else if (!isStable) {
            // Nếu không ổn định nhưng mới chỉ ổn định trong một thời gian ngắn, bỏ qua
            if (lastStableTime.current && now - lastStableTime.current < MIN_STABLE_DURATION) {
                landmarkHistoryRef.current = newHistory;
                return false;
            }
            
            // Xác nhận đã không ổn định
            if (!lastUnstableTime.current) {
                lastUnstableTime.current = now;
            }
            
            // Chỉ chuyển sang trạng thái không ổn định nếu đã không ổn định đủ lâu
            if (lastUnstableTime.current && now - lastUnstableTime.current > 300) {
                lastStableTime.current = null;
                setIsFrameStable(false);
                setStatusMessage("Please keep your face steady for analysis");
                setPrevStatusMessage("Please keep your face steady for analysis");
                setProgress(20);
            }
        }
    
        landmarkHistoryRef.current = newHistory;
        return isStable;
    }, [
        HISTORY_SIZE,
        STABILITY_THRESHOLD,
        STABILITY_DURATION,
        MIN_STABLE_DURATION,
        detectionResults,
        noFaceDetectedDuration,
        handData.isHandDetected,
        isFrameStable
    ]);

    // Được tối ưu lại để giảm nhấp nháy
    function drawMakeup(
        ctx: CanvasRenderingContext2D,
        landmarks: NormalizedLandmark[],
        width: number,
        height: number,
        forceRender: boolean = false
    ) {
        // Ngăn render đồng thời
        if (isRenderingRef.current && !forceRender) {
            return;
        }
        
        const now = performance.now();
        isRenderingRef.current = true;
        
        try {
            // Kiểm tra xem filter có thay đổi so với lần render trước không
            const filterChanged = lastRenderedFilter.current !== currentFilter;
            
            // Cập nhật filter hiện tại
            if (filterChanged) {
                console.log(`Filter changed from ${lastRenderedFilter.current} to ${currentFilter}`);
                lastRenderedFilter.current = currentFilter;
                // Bắt buộc vẽ lại khi filter thay đổi
                makeupImageRef.current = null;
            }
            
            // Nếu đã có cache và chưa đến thời điểm vẽ lại và không có yêu cầu render mới, sử dụng cache
            if (makeupImageRef.current && 
                !filterChanged && 
                !forceRender && 
                !renderRequestRef.current && 
                now - lastMakeupRender.current < MAKEUP_RENDER_INTERVAL) {
                ctx.putImageData(makeupImageRef.current, 0, 0);
                isRenderingRef.current = false;
                return;
            }
            
            // Reset yêu cầu render nếu có
            if (renderRequestRef.current) {
                renderRequestRef.current = false;
            }
            
            // Cập nhật thời gian render cuối cùng
            lastMakeupRender.current = now;
            
            // Nếu không ổn định và có cache ổn định trước đó, sử dụng cache đó
            if (!isFrameStable && stableImageCacheRef.current && !forceRender) {
                ctx.putImageData(stableImageCacheRef.current, 0, 0);
                isRenderingRef.current = false;
                return;
            }
            
            // Đảm bảo offscreen canvas tồn tại và có kích thước phù hợp
            if (!offscreenCanvasRef.current) {
                offscreenCanvasRef.current = document.createElement('canvas');
                offscreenCanvasRef.current.width = width;
                offscreenCanvasRef.current.height = height;
            } else if (offscreenCanvasRef.current.width !== width || offscreenCanvasRef.current.height !== height) {
                offscreenCanvasRef.current.width = width;
                offscreenCanvasRef.current.height = height;
            }
            
            const offscreenCtx = offscreenCanvasRef.current.getContext('2d', { willReadFrequently: true });
            if (!offscreenCtx) {
                isRenderingRef.current = false;
                return;
            }
            
            // Xóa offscreen canvas
            offscreenCtx.clearRect(0, 0, width, height);
            
            // Lấy màu từ filter hiện tại
            const colors = filterColors[currentFilter];
            
            // Lấy các điểm đánh dấu cho môi
            const outerLip = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
            const innerLip = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
        
            // Vẽ môi
            offscreenCtx.save();
            offscreenCtx.filter = "blur(5px)";
        
            // Vẽ nền môi
            offscreenCtx.beginPath();
            offscreenCtx.fillStyle = colors.lipColor;
            outerLip.forEach((index, i) => {
                const pt = landmarks[index];
                const x = pt.x * width;
                const y = pt.y * height;
                if (i === 0) offscreenCtx.moveTo(x, y);
                else offscreenCtx.lineTo(x, y);
            });
            offscreenCtx.closePath();
            offscreenCtx.fill();
        
            // Gradient hiệu ứng bóng (trong lòng môi)
            const gradient = offscreenCtx.createRadialGradient(
                landmarks[13].x * width,
                landmarks[13].y * height,
                1,
                landmarks[13].x * width,
                landmarks[13].y * height,
                width * 0.05
            );
            gradient.addColorStop(0, colors.lipHighlight);
            gradient.addColorStop(1, "rgba(230, 71, 145, 0)");
        
            offscreenCtx.beginPath();
            offscreenCtx.fillStyle = gradient;
            outerLip.forEach((index, i) => {
                const pt = landmarks[index];
                const x = pt.x * width;
                const y = pt.y * height;
                if (i === 0) offscreenCtx.moveTo(x, y);
                else offscreenCtx.lineTo(x, y);
            });
            offscreenCtx.closePath();
            offscreenCtx.fill();
        
            // Khoét phần môi trong để tạo độ dày
            offscreenCtx.globalCompositeOperation = "destination-out";
            offscreenCtx.beginPath();
            innerLip.forEach((index, i) => {
                const pt = landmarks[index];
                const x = pt.x * width;
                const y = pt.y * height;
                if (i === 0) offscreenCtx.moveTo(x, y);
                else offscreenCtx.lineTo(x, y);
            });
            offscreenCtx.closePath();
            offscreenCtx.fill();
        
            offscreenCtx.globalCompositeOperation = "source-over";
            offscreenCtx.restore();
        
            // Vẽ má hồng
            const leftCheekPoint = landmarks[50];
            const rightCheekPoint = landmarks[280];
        
            // Tọa độ thực của gò má
            const leftX = leftCheekPoint.x * width;
            const leftY = leftCheekPoint.y * height;
            const rightX = rightCheekPoint.x * width;
            const rightY = rightCheekPoint.y * height;
        
            offscreenCtx.save();
            offscreenCtx.filter = "blur(7px)";
            offscreenCtx.fillStyle = colors.cheekColor;
        
            // Điều chỉnh độ lớn má hồng theo kiểu filter
            let radius;
            switch (currentFilter) {
                case 'glamour':
                    radius = Math.min(width, height) * 0.022;
                    break;
                case 'soft':
                    radius = Math.min(width, height) * 0.025;
                    break;
                case 'dramatic':
                    radius = Math.min(width, height) * 0.02;
                    break;
                case 'nude':
                    radius = Math.min(width, height) * 0.019;
                    break;
                default:
                    radius = Math.min(width, height) * 0.018;
            }
        
            // Má trái
            offscreenCtx.beginPath();
            offscreenCtx.arc(leftX, leftY, radius, 0, Math.PI * 2);
            offscreenCtx.fill();
        
            // Má phải
            offscreenCtx.beginPath();
            offscreenCtx.arc(rightX, rightY, radius, 0, Math.PI * 2);
            offscreenCtx.fill();
        
            offscreenCtx.restore();
        
            // Vẽ lông mày
            const leftEyebrow = [70, 63, 105, 66, 107];
            const rightEyebrow = [336, 296, 334, 293, 300];
        
            offscreenCtx.save();
            offscreenCtx.filter = "blur(3px)";
            offscreenCtx.fillStyle = colors.eyebrowColor;
            
            // Lông mày trái
            offscreenCtx.beginPath();
            leftEyebrow.forEach((index, i) => {
                const pt = landmarks[index];
                const x = pt.x * width;
                const y = pt.y * height;
                if (i === 0) offscreenCtx.moveTo(x, y);
                else offscreenCtx.lineTo(x, y);
            });
            offscreenCtx.closePath();
            offscreenCtx.fill();
            
            // Lông mày phải
            offscreenCtx.beginPath();
            rightEyebrow.forEach((index, i) => {
                const pt = landmarks[index];
                const x = pt.x * width;
                const y = pt.y * height;
                if (i === 0) offscreenCtx.moveTo(x, y);
                else offscreenCtx.lineTo(x, y);
            });
            offscreenCtx.closePath();
            offscreenCtx.fill();
            offscreenCtx.restore();
            
            // Vẽ sống mũi và vùng highlight
            const noseBridge = [6, 197, 195, 5, 4];
            const noseContourLeft = [98, 327, 326];
            const noseContourRight = [327, 326, 98].map((i) => 454 - i);
        
            // Highlight sống mũi
            offscreenCtx.save();
            offscreenCtx.filter = "blur(5px)";
            offscreenCtx.beginPath();
            offscreenCtx.fillStyle = colors.highlightColor;
            noseBridge.forEach((index, i) => {
                const pt = landmarks[index];
                const x = pt.x * width;
                const y = pt.y * height;
                if (i === 0) offscreenCtx.moveTo(x, y);
                else offscreenCtx.lineTo(x, y);
            });
            offscreenCtx.stroke();
            offscreenCtx.restore();
        
            // Shadow 2 bên cánh mũi (contour)
            const drawSideShadow = (points: number[]) => {
                offscreenCtx.save();
                offscreenCtx.filter = "blur(4px)";
                offscreenCtx.beginPath();
                offscreenCtx.fillStyle = colors.contourColor;
                points.forEach((index, i) => {
                    const pt = landmarks[index];
                    const x = pt.x * width;
                    const y = pt.y * height;
                    if (i === 0) offscreenCtx.moveTo(x, y);
                    else offscreenCtx.lineTo(x, y);
                });
                offscreenCtx.closePath();
                offscreenCtx.fill();
                offscreenCtx.restore();
            };
        
            drawSideShadow(noseContourLeft);
            drawSideShadow(noseContourRight);
        
            // Vẽ eyeliner
            const leftEyeliner = [33, 7, 163, 144, 145, 153, 154, 155];
            const rightEyeliner = [263, 249, 390, 373, 374, 380, 381, 382];
        
            const drawEyeliner = (indices: number[], color: string) => {
                offscreenCtx.save();
                offscreenCtx.beginPath();
                offscreenCtx.strokeStyle = color;
                
                // Điều chỉnh độ dày eyeliner theo kiểu filter
                switch (currentFilter) {
                    case 'glamour':
                        offscreenCtx.lineWidth = 1.5;
                        break;
                    case 'dramatic':
                        offscreenCtx.lineWidth = 2;
                        break;
                    case 'soft':
                    case 'nude':
                        offscreenCtx.lineWidth = 0.8;
                        break;
                    default:
                        offscreenCtx.lineWidth = 1;
                }
                
                offscreenCtx.lineJoin = "round";
                offscreenCtx.lineCap = "round";
        
                indices.forEach((index, i) => {
                    const pt = landmarks[index];
                    const x = pt.x * width;
                    const y = pt.y * height;
                    if (i === 0) offscreenCtx.moveTo(x, y);
                    else offscreenCtx.lineTo(x, y);
                });
        
                offscreenCtx.stroke();
                offscreenCtx.restore();
            };
        
            // Eyeliner
            drawEyeliner(leftEyeliner, colors.eyelinerColor);
            drawEyeliner(rightEyeliner, colors.eyelinerColor);
        
            // Vẽ phấn mắt cho một số kiểu
            if (['glamour', 'dramatic', 'soft'].includes(currentFilter)) {
                const drawEyeShadow = (eye: number[]) => {
                    offscreenCtx.save();
                    offscreenCtx.filter = "blur(8px)";
                    offscreenCtx.beginPath();
                    
                    // Chọn màu phấn mắt theo kiểu
                    let shadowColor;
                    switch (currentFilter) {
                        case 'glamour':
                            shadowColor = "rgba(120, 60, 60, 0.3)";
                            break;
                        case 'dramatic':
                            shadowColor = "rgba(80, 40, 60, 0.4)";
                            break;
                        case 'soft':
                            shadowColor = "rgba(200, 160, 180, 0.25)";
                            break;
                        default:
                            shadowColor = "rgba(150, 120, 120, 0.2)";
                    }
                    
                    offscreenCtx.fillStyle = shadowColor;
                    eye.forEach((index, i) => {
                        const pt = landmarks[index];
                        const x = pt.x * width;
                        const y = pt.y * height;
                        if (i === 0) offscreenCtx.moveTo(x, y);
                        else offscreenCtx.lineTo(x, y);
                    });
                    offscreenCtx.closePath();
                    offscreenCtx.fill();
                    offscreenCtx.restore();
                };
                
                const leftEyeShadow = [33, 7, 163, 144, 145, 153, 154, 155, 33];
                const rightEyeShadow = [263, 249, 390, 373, 374, 380, 381, 382, 263];
                
                drawEyeShadow(leftEyeShadow);
                drawEyeShadow(rightEyeShadow);
            }
        
            // Da trắng sáng
            const faceOutline = [
                10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
                379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
                234, 127, 162, 21, 54,
            ];
        
            offscreenCtx.save();
            offscreenCtx.beginPath();
            faceOutline.forEach((index, i) => {
                const pt = landmarks[index];
                const x = pt.x * width;
                const y = pt.y * height;
                if (i === 0) offscreenCtx.moveTo(x, y);
                else offscreenCtx.lineTo(x, y);
            });
            offscreenCtx.closePath();
        
            // Tô màu da + blur
            offscreenCtx.filter = "blur(6px)";
            offscreenCtx.fillStyle = colors.skinColor;
            offscreenCtx.fill();
            offscreenCtx.restore();
            
            // Thêm hiệu ứng điểm nhấn riêng cho từng kiểu filter
            if (currentFilter === 'glamour' || currentFilter === 'dramatic') {
                // Thêm highlight cho đường gò má
                const cheekboneLeft = [50, 66, 107];
                const cheekboneRight = [280, 296, 334];
                
                const drawCheekboneHighlight = (points: number[]) => {
                    offscreenCtx.save();
                    offscreenCtx.filter = "blur(8px)";
                    offscreenCtx.beginPath();
                    offscreenCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
                    offscreenCtx.lineWidth = 2;
                    offscreenCtx.lineCap = "round";
                    points.forEach((index, i) => {
                        const pt = landmarks[index];
                        const x = pt.x * width;
                        const y = pt.y * height;
                        if (i === 0) offscreenCtx.moveTo(x, y);
                        else offscreenCtx.lineTo(x, y);
                    });
                    offscreenCtx.stroke();
                    offscreenCtx.restore();
                };
                
                drawCheekboneHighlight(cheekboneLeft);
                drawCheekboneHighlight(cheekboneRight);
            }
            
            // Thêm hiệu ứng bóng môi cho kiểu 'glamour' và 'soft'
            if (currentFilter === 'glamour' || currentFilter === 'soft') {
                offscreenCtx.save();
                offscreenCtx.filter = "blur(4px)";
                offscreenCtx.beginPath();
                offscreenCtx.fillStyle = currentFilter === 'glamour' 
                    ? "rgba(255, 255, 255, 0.35)" 
                    : "rgba(255, 255, 255, 0.3)";
                    
                const centerLip = landmarks[13];
                const lipX = centerLip.x * width;
                const lipY = centerLip.y * height - 3;
                
                // Tạo điểm nhấn sáng nhỏ ở giữa môi trên
                offscreenCtx.arc(lipX, lipY, 4, 0, Math.PI * 2);
                offscreenCtx.fill();
                offscreenCtx.restore();
            }
        
            // Lưu lại kết quả vào cache
            try {
                makeupImageRef.current = offscreenCtx.getImageData(0, 0, width, height);
            } catch (e) {
                console.error("[PersonalMakeup] Error getting ImageData:", e);
                // Không lưu cache nếu có lỗi
                makeupImageRef.current = null;
            }
            
            // Nếu frame ổn định, lưu vào cache ổn định để sử dụng khi không ổn định
            if (isFrameStable && makeupImageRef.current) {
                stableImageCacheRef.current = makeupImageRef.current;
            }
            
            // Copy từ offscreen canvas sang canvas chính trong một lần thực hiện
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(offscreenCanvasRef.current, 0, 0);
            
        } catch (error) {
            console.error("[PersonalMakeup] Error in drawMakeup:", error);
            // Nếu có lỗi, sử dụng cache nếu có
            if (makeupImageRef.current) {
                ctx.putImageData(makeupImageRef.current, 0, 0);
            }
        } finally {
            // Kết thúc quá trình vẽ và cho phép vẽ tiếp theo
            isRenderingRef.current = false;
        }
    }

    // Separate rendering loop - tách riêng luồng vẽ để tránh nhấp nháy
    useEffect(() => {
        if (!canvasRef.current || !displayVideoRef.current || !isVideoReady) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        const renderLoop = () => {
            // Chỉ vẽ lại khi có landmarks và cần render
            if (landmarksToRender.current) {
                drawMakeup(
                    ctx, 
                    landmarksToRender.current, 
                    canvas.width, 
                    canvas.height, 
                    renderRequestRef.current
                );
            } else if (stableImageCacheRef.current) {
                // Nếu không có landmarks nhưng có cache, vẽ từ cache
                ctx.putImageData(stableImageCacheRef.current, 0, 0);
            }

            // Tiếp tục vòng lặp
            requestAnimationFrame(renderLoop);
        };

        // Bắt đầu vòng lặp render
        requestAnimationFrame(renderLoop);

    }, [isVideoReady]);

    // Luồng phân tích và cập nhật landmarks để vẽ - tách biệt khỏi luồng vẽ
    useEffect(() => {
        if (!stream || !canvasRef.current || !displayVideoRef.current || !isVideoReady) {
            return;
        }
        
        const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        
        // Đảm bảo kích thước canvas phù hợp với video
        const resizeCanvas = () => {
            if (video.videoWidth && video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Cập nhật kích thước offscreen canvas
                if (offscreenCanvasRef.current) {
                    offscreenCanvasRef.current.width = video.videoWidth;
                    offscreenCanvasRef.current.height = video.videoHeight;
                }
            }
        };
        
        resizeCanvas();

        // Tối ưu hóa luồng phát hiện và cập nhật landmarks
        const detect = async () => {
            try {
                const now = performance.now();
                
                // Ngăn thực hiện quá nhiều frame trong một thời gian ngắn
                const minInterval = filterTransitionRef.current 
                    ? 16 // 60fps khi đang chuyển filter cho mượt
                    : handData.isHandDetected 
                        ? 100 // 10fps khi có tay để tiết kiệm tài nguyên
                        : isFrameStable 
                            ? 33 // 30fps khi ổn định
                            : 66; // 15fps khi không ổn định
                
                if (now - lastDetectTime.current < minInterval && !filterTransitionRef.current && !renderRequestRef.current) {
                    animationFrameId.current = requestAnimationFrame(detect);
                    return;
                }
                
                lastDetectTime.current = now;
                
                // Kiểm tra yêu cầu render mới
                if (renderRequestRef.current && now - lastRenderRequestTime.current > 300) {
                    // Reset yêu cầu render nếu đã quá lâu
                    renderRequestRef.current = false;
                }
                
                // Chỉ phân tích và vẽ khi có landmarks khuôn mặt
                if (detectionResults?.face?.faceLandmarks && detectionResults?.face?.faceLandmarks.length > 0) {
                    const landmarks = detectionResults?.face?.faceLandmarks[0];
                    
                    // Cập nhật landmarks để render
                    landmarksToRender.current = landmarks;
                    
                    // Kiểm tra ổn định khuôn mặt (chỉ khi không phải đang chuyển filter)
                    if (!filterTransitionRef.current) {
                        checkFrameStability(landmarks);
                    }
                    
                    // Chỉ phân tích khi cần thiết (frame ổn định + thời gian đủ lâu kể từ lần phân tích trước)
                    const shouldAnalyze = (isFrameStable || filterTransitionRef.current) && 
                                         (!lastRenderedLandmarks.current || 
                                          now - lastAnalysisTime.current > 1000);
                                          
                    if (shouldAnalyze) {
                        // Phân tích khuôn mặt và tạo gợi ý
                        lastAnalysisTime.current = now;
                        lastRenderedLandmarks.current = landmarks;
                        
                        // Sử dụng cache để tránh phân tích lặp lại
                        if (!faceFeaturesCache.current) {
                            faceFeaturesCache.current = analyzeFacialFeatures(landmarks);
                        }
                        
                        // Tạo gợi ý từ đặc điểm khuôn mặt
                        const suggestion = generateMakeupSuggestion(faceFeaturesCache.current);
                        setMakeupSuggestion(suggestion);
                    }
                } else {
                    // Không phát hiện khuôn mặt - chỉ reset landmarks khi khuôn mặt
                    // biến mất đủ lâu để tránh nhấp nháy khi mất nhận dạng một lúc
                    if (noFaceDetectedDuration > 500) {
                        landmarksToRender.current = null;
                    }
                    
                    // Không reset lastRenderedLandmarks và faceFeaturesCache ngay lập tức
                    // để tránh phải phân tích lại khi mặt xuất hiện trở lại trong thời gian ngắn
                    
                    // Chỉ khi mất nhận diện mặt đủ lâu mới reset các giá trị
                    if (noFaceDetectedDuration > 3000) {
                        faceFeaturesCache.current = null;
                        lastRenderedLandmarks.current = null;
                        landmarksToRender.current = null;
                        setMakeupSuggestion(null);
                    }
                }
            } catch (err) {
                console.error("[PersonalMakeup] Error during analysis:", err);
            }

            animationFrameId.current = requestAnimationFrame(detect);
        };

        detect();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [
        stream, 
        isVideoReady,
        handData.isHandDetected, 
        isFrameStable, 
        detectionResults, 
        checkFrameStability,
        prevStatusMessage,
        statusMessage,
        currentFilter,
        generateMakeupSuggestion,
        noFaceDetectedDuration
    ]);

    // Xử lý phát hiện không có khuôn mặt - tối ưu hóa interval
    useEffect(() => {
        // Sử dụng interval để theo dõi thời gian không phát hiện khuôn mặt
        const interval = setInterval(() => {
            if (!detectionResults || !detectionResults.face?.faceLandmarks) {
                setNoFaceDetectedDuration(prev => prev + 1000);
            } else {
                setNoFaceDetectedDuration(0);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [detectionResults]);

    // Thêm xử lý chuyển filter với bàn phím
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Bỏ qua nếu đang chuyển filter
            if (filterTransitionRef.current) return;
            
            let newFilter: FilterType | null = null;
            
            switch(e.key) {
                case '1':
                    newFilter = 'natural';
                    break;
                case '2':
                    newFilter = 'glamour';
                    break;
                case '3': 
                    newFilter = 'soft';
                    break;
                case '4':
                    newFilter = 'dramatic';
                    break;
                case '5':
                    newFilter = 'nude';
                    break;
            }
            
            // Chỉ xử lý tiếp nếu có filter mới và khác filter hiện tại
            if (newFilter && newFilter !== currentFilter) {
                // Đánh dấu đang trong quá trình chuyển filter
                filterTransitionRef.current = true;
                
                // Xóa cache makeup để buộc vẽ lại
                makeupImageRef.current = null;
                
                // Cập nhật filter mới
                setCurrentFilter(newFilter);
                
                // Lưu filter mới ngay lập tức vào ref
                lastRenderedFilter.current = newFilter;
                
                // Đánh dấu yêu cầu render ngay
                renderRequestRef.current = true;
                lastRenderRequestTime.current = performance.now();
                
                // Cập nhật lại gợi ý makeup nếu có đặc điểm khuôn mặt
                if (faceFeaturesCache.current) {
                    const suggestion = generateMakeupSuggestion(faceFeaturesCache.current);
                    setMakeupSuggestion(suggestion);
                }
                
                // Kết thúc quá trình chuyển filter sau 300ms
                setTimeout(() => {
                    filterTransitionRef.current = false;
                }, 300);
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [currentFilter, generateMakeupSuggestion]);

    // Thêm double buffer để giảm thiểu nhấp nháy
    useEffect(() => {
        const setupDoubleBuffer = () => {
            if (!canvasRef.current || !displayVideoRef.current) return;
            
            const canvas = canvasRef.current;
            
            // Tạo đối tượng CSS thuộc tính cho canvas để tối ưu rendering
            if (canvas.style) {
                // Thêm GPU acceleration
                canvas.style.willChange = 'transform';
                canvas.style.transform = 'translateZ(0)';
                canvas.style.backfaceVisibility = 'hidden';
                
                // Đảm bảo canvas không bị mờ khi scale
                canvas.style.imageRendering = 'high-quality';
            }
        };
        
        setupDoubleBuffer();
    }, []);

    // Cleanup resources khi unmount
    useEffect(() => {
        return () => {
            // Giải phóng các tài nguyên
            if (makeupImageRef.current) {
                makeupImageRef.current = null;
            }
            
            if (stableImageCacheRef.current) {
                stableImageCacheRef.current = null;
            }
            
            if (offscreenCanvasRef.current) {
                offscreenCanvasRef.current = null;
            }
            
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
            
            // Reset các refs khác
            lastRenderedLandmarks.current = null;
            faceFeaturesCache.current = null;
            landmarksToRender.current = null;
        };
    }, []);

    return (
        <AnalysisLayout
            title="Personal Makeup"
            description="Get makeup suggestions based on your facial features."
            videoRef={displayVideoRef}
            canvasRef={canvasRef}
            result={makeupSuggestion}
            error={error || webcamError}
            statusMessage={statusMessage}
            progress={progress}
            detectionResults={detectionResults}
        />
    );
}
