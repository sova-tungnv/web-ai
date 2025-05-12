/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalMakeup.tsx - Component phân tích và áp dụng makeup tối ưu hóa
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
    const [statusMessage, setStatusMessage] = useState<string>("Initializing camera...");
    const [isFrameStable, setIsFrameStable] = useState(false);
    const [noFaceDetectedDuration, setNoFaceDetectedDuration] = useState<number>(0);
    const [progress, setProgress] = useState<number>(0);
    const [makeupSuggestion, setMakeupSuggestion] = useState<string | null>(null);
    const [currentFilter, setCurrentFilter] = useState<FilterType>("natural");

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationRef = useRef<number | null>(null);
    const lastRenderTime = useRef<number>(0);
    const facialFeaturesRef = useRef<FacialFeatures | null>(null);
    const landmarkHistoryRef = useRef<NormalizedLandmark[][]>([]);
    const lastStableTime = useRef<number | null>(null);
    const isProhibitedMovement = useRef<boolean>(false);
    const lastFilterChange = useRef<number>(0);
    const shouldForceRender = useRef<boolean>(false);

    // Constants
    const STABILITY_THRESHOLD = 12;
    const STABILITY_DURATION = 800;
    const RENDER_INTERVAL = 25; // ms between renders (controls frame rate)
    const SKIP_FRAMES = 2; // Process only every Nth frame
    const frameCounter = useRef<number>(0);
    
    // Color presets for filters
    const filterColors = {
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
    };

    // Filter descriptions
    const filterDescriptions = {
        natural: "Tự nhiên, nhẹ nhàng tôn lên vẻ đẹp vốn có",
        glamour: "Quyến rũ, nổi bật với son đỏ và eyeliner đậm",
        soft: "Mềm mại, nhẹ nhàng với tông hồng phấn",
        dramatic: "Mạnh mẽ, ấn tượng với tông màu sâu", 
        nude: "Tự nhiên với tông màu nude, phù hợp hàng ngày"
    };

    // Component mount setup
    useEffect(() => {
        setCurrentView(VIEWS.COSMETIC_SURGERY);
        
        // Cleanup on unmount
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, []);
    
    // Setup video stream
    useEffect(() => {
        if (!stream || !displayVideoRef.current) return;
        
        displayVideoRef.current.srcObject = stream;
        displayVideoRef.current.onloadedmetadata = () => {
            const video = displayVideoRef.current;
            if (!video) return;
            
            video.play().catch((err: any) => {
                console.error("[PersonalMakeup] Error playing video:", err);
                setError("Cannot initialize video: " + err.message);
            });
            
            // Set canvas size to match video
            if (canvasRef.current) {
                canvasRef.current.width = video.videoWidth;
                canvasRef.current.height = video.videoHeight;
                
                // Add GPU acceleration hints to canvas
                if (canvasRef.current.style) {
                    canvasRef.current.style.willChange = 'transform';
                    canvasRef.current.style.transform = 'translateZ(0)';
                }
            }
            
            setIsVideoReady(true);
            setIsLoading(false);
            setStatusMessage("Please keep your face steady for analysis");
            setProgress(20);
        };
    }, [stream, setIsLoading]);

    // Function to analyze facial features for makeup suggestions
    const analyzeFacialFeatures = useCallback((landmarks: NormalizedLandmark[]): FacialFeatures => {
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
    }, []);

    // Function to generate makeup suggestions based on facial analysis
    const generateMakeupSuggestion = useCallback((features: FacialFeatures): string => {
        const suggestions: string[] = [];

        // Add current filter description
        suggestions.push(
            `<div style="margin-bottom: 10px; padding: 10px; background: rgba(255,182,193,0.2); border-radius: 8px;">
                <strong style="font-size: 1em; color: #d64161;">💄 Filter hiện tại: ${currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)}</strong>
                <p style="margin: 5px 0 0; font-size: 0.9em;">${filterDescriptions[currentFilter]}</p>
            </div>`
        );

        // Face shape recommendation
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

        // Eye distance recommendation
        if (features.eyeDistance > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Đôi mắt bạn khá to và cách xa nhau</strong> <br/>💄<em style="font-size: 17px;"> Nên kẻ eyeliner đậm và chuốt mascara kỹ phần khóe mắt trong để thu hẹp khoảng cách</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Đôi mắt bạn nhỏ hoặc gần nhau</strong> <br/>💄<em style="font-size: 17px;">Ưu tiên eyeliner mảnh và phấn mắt sáng để mở rộng đôi mắt</em>`
            );
        }

        // Lip recommendation
        if (features.lipWidth > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 Bạn có đôi môi đầy đặn </strong><br/> 💄<em style="font-size: 17px;"> Hãy dùng son lì hoặc màu trầm để tạo cảm giác hài hòa hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 Môi bạn khá nhỏ gọn </strong><br/> 💄<em style="font-size: 17px;"> Sử dụng son bóng hoặc tông màu tươi sáng để giúp môi trông căng mọng hơn.</em>`
            );
        }

        // Nose recommendation
        if (features.noseWidth > 0.07) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Mũi của bạn hơi rộng </strong><br/> 💄<em style="font-size: 17px;"> Tạo khối nhẹ hai bên sống mũi để tạo hiệu ứng thon gọn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Mũi bạn thon gọn </strong><br/> 💄<em style="font-size: 17px;"> Hãy tô chút highlight dọc sống mũi để tăng chiều sâu và nổi bật.</em>`
            );
        }

        // Eyebrow recommendation
        if (features.browLength < features.eyeDistance * 1.5) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️‍🗨️ Lông mày bạn ngắn và nhẹ </strong><br/> 💄<em style="font-size: 17px;"> Nên kẻ dài thêm một chút và tạo độ cong nhẹ để gương mặt hài hòa hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️‍🗨️ Lông mày bạn khá dài và rõ nét </strong><br/> 💄<em style="font-size: 17px;"> Chỉ cần giữ dáng tự nhiên, không nên tô quá sắc để tránh làm khuôn mặt cứng.</em>`
            );
        }

        // Cheekbone recommendation
        if (features.cheekboneHeight < 0.4) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">😊 Gò má bạn cao </strong><br/> 💄<em style="font-size: 17px;"> Hãy đánh má hồng thấp hơn xương gò má và tán ngang để làm dịu đường nét.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">😊 Gò má bạn thấp </strong><br/> 💄<em style="font-size: 17px;"> Nên tán má hồng cao và kéo dài lên thái dương để tạo hiệu ứng nâng mặt.</em>`
            );
        }

        // Forehead recommendation
        if (features.foreheadHeight > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🔍 Trán bạn cao </strong><br/> 💄<em style="font-size: 17px;"> Dùng phấn tối màu sát chân tóc để tạo cảm giác trán thấp hơn và mềm mại hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🔍 Trán bạn thấp </strong><br/> 💄<em style="font-size: 17px;"> Có thể chải tóc ra sau hoặc highlight vùng trán để khuôn mặt cân đối hơn.</em>`
            );
        }

        // Filter selection UI
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
    }, [currentFilter]);

    // Handle filter buttons click
    useEffect(() => {
        const handleFilterClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'BUTTON' && target.dataset.filter) {
                const filterName = target.dataset.filter as FilterType;
                
                // Skip if same filter or recently changed
                if (filterName === currentFilter) return;
                if (performance.now() - lastFilterChange.current < 300) return;
                
                lastFilterChange.current = performance.now();
                setCurrentFilter(filterName);
                shouldForceRender.current = true;
                
                // Update suggestion if we have facial features
                if (facialFeaturesRef.current) {
                    const suggestion = generateMakeupSuggestion(facialFeaturesRef.current);
                    setMakeupSuggestion(suggestion);
                }
            }
        };
        
        document.addEventListener('click', handleFilterClick);
        return () => document.removeEventListener('click', handleFilterClick);
    }, [currentFilter, generateMakeupSuggestion]);

    // Handle keyboard shortcuts for filter selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (performance.now() - lastFilterChange.current < 300) return;
            
            let newFilter: FilterType | null = null;
            
            switch(e.key) {
                case '1': newFilter = 'natural'; break;
                case '2': newFilter = 'glamour'; break;
                case '3': newFilter = 'soft'; break;
                case '4': newFilter = 'dramatic'; break;
                case '5': newFilter = 'nude'; break;
            }
            
            if (newFilter && newFilter !== currentFilter) {
                lastFilterChange.current = performance.now();
                setCurrentFilter(newFilter);
                shouldForceRender.current = true;
                
                if (facialFeaturesRef.current) {
                    const suggestion = generateMakeupSuggestion(facialFeaturesRef.current);
                    setMakeupSuggestion(suggestion);
                }
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentFilter, generateMakeupSuggestion]);

    // Monitor face stability
    const checkFaceStability = useCallback((landmarks: NormalizedLandmark[]) => {
        if (!landmarks || landmarks.length < 468) return false;
        
        // Store key points for stability check
        const keyPoints = [33, 263, 61, 291, 152]; // eyes, mouth, nose
        const keyLandmarks = keyPoints.map(idx => ({
            x: landmarks[idx].x,
            y: landmarks[idx].y
        }));
        
        // Update landmark history
        landmarkHistoryRef.current.push(landmarks);
        if (landmarkHistoryRef.current.length > 5) {
            landmarkHistoryRef.current.shift();
        }
        
        // Not enough history yet
        if (landmarkHistoryRef.current.length < 3) {
            return false;
        }
        
        // Check stability between frames
        let totalMovement = 0;
        
        for (let i = 1; i < landmarkHistoryRef.current.length; i++) {
            const prevFrame = landmarkHistoryRef.current[i-1];
            const currFrame = landmarkHistoryRef.current[i];
            
            for (const pointIdx of keyPoints) {
                const prev = prevFrame[pointIdx];
                const curr = currFrame[pointIdx];
                const dx = (curr.x - prev.x) * 1000; // Scale for better precision
                const dy = (curr.y - prev.y) * 1000;
                totalMovement += Math.sqrt(dx*dx + dy*dy);
            }
        }
        
        const avgMovement = totalMovement / ((landmarkHistoryRef.current.length-1) * keyPoints.length);
        const isStable = avgMovement < STABILITY_THRESHOLD;
        
        // Update stability state
        const now = performance.now();
        
        if (isStable) {
            if (!lastStableTime.current) {
                lastStableTime.current = now;
                setStatusMessage("Analyzing face...");
                setProgress(60);
            } else if (now - lastStableTime.current > STABILITY_DURATION && !isFrameStable) {
                // Face has been stable for enough time
                setIsFrameStable(true);
                setStatusMessage("Analysis completed!");
                setProgress(100);
                
                // Analyze facial features after stability confirmed
                if (!facialFeaturesRef.current && landmarks) {
                    const features = analyzeFacialFeatures(landmarks);
                    facialFeaturesRef.current = features;
                    const suggestions = generateMakeupSuggestion(features);
                    setMakeupSuggestion(suggestions);
                }
                
                isProhibitedMovement.current = false;
            }
        } else {
            // Reset stability if face moved significantly
            if (lastStableTime.current && avgMovement > STABILITY_THRESHOLD * 1.5) {
                lastStableTime.current = null;
                if (isFrameStable) {
                    setIsFrameStable(false);
                    setStatusMessage("Please keep your face steady");
                    setProgress(20);
                }
            }
        }
        
        return isStable;
    }, [STABILITY_THRESHOLD, STABILITY_DURATION, isFrameStable, analyzeFacialFeatures, generateMakeupSuggestion]);

    // Face not detected handling
    useEffect(() => {
        if (!detectionResults?.face?.faceLandmarks) {
            const timeout = setTimeout(() => {
                setNoFaceDetectedDuration(prev => prev + 500);
                
                if (noFaceDetectedDuration > 1500) {
                    setStatusMessage("Face not detected. Please adjust your position.");
                    setProgress(0);
                }
            }, 500);
            
            return () => clearTimeout(timeout);
        } else if (noFaceDetectedDuration > 0) {
            setNoFaceDetectedDuration(0);
        }
    }, [detectionResults, noFaceDetectedDuration]);

    // Function to draw makeup on face
    const drawMakeup = useCallback((ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) => {
        if (!landmarks || landmarks.length < 468) return;
        
        // Get current filter colors
        const colors = filterColors[currentFilter];
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // =========================
        // Draw lips
        // =========================
        const outerLip = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
        const innerLip = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
    
        ctx.save();
        ctx.filter = "blur(3px)";
    
        // Outer lip
        ctx.beginPath();
        ctx.fillStyle = colors.lipColor;
        for (let i = 0; i < outerLip.length; i++) {
            const pt = landmarks[outerLip[i]];
            const x = pt.x * width;
            const y = pt.y * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    
        // Lip highlight
        const lipCenter = landmarks[13];
        const highlightGradient = ctx.createRadialGradient(
            lipCenter.x * width,
            lipCenter.y * height,
            1,
            lipCenter.x * width,
            lipCenter.y * height,
            width * 0.04
        );
        highlightGradient.addColorStop(0, colors.lipHighlight);
        highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    
        ctx.beginPath();
        ctx.fillStyle = highlightGradient;
        for (let i = 0; i < outerLip.length; i++) {
            const pt = landmarks[outerLip[i]];
            const x = pt.x * width;
            const y = pt.y * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    
        // Inner lip cutout
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        for (let i = 0; i < innerLip.length; i++) {
            const pt = landmarks[innerLip[i]];
            const x = pt.x * width;
            const y = pt.y * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
    
        // =========================
        // Draw blush
        // =========================
        const leftCheekPoint = landmarks[50];
        const rightCheekPoint = landmarks[280];
        const blushRadius = Math.min(width, height) * 0.02;
    
        ctx.save();
        ctx.filter = "blur(7px)";
        ctx.fillStyle = colors.cheekColor;
    
        // Left cheek
        ctx.beginPath();
        ctx.arc(leftCheekPoint.x * width, leftCheekPoint.y * height, blushRadius, 0, Math.PI * 2);
        ctx.fill();
    
        // Right cheek
        ctx.beginPath();
        ctx.arc(rightCheekPoint.x * width, rightCheekPoint.y * height, blushRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    
        // =========================
        // Draw eyebrows
        // =========================
        const leftEyebrow = [70, 63, 105, 66, 107];
        const rightEyebrow = [336, 296, 334, 293, 300];
    
        ctx.save();
        ctx.filter = "blur(2px)";
        ctx.fillStyle = colors.eyebrowColor;
        
        // Left eyebrow
        ctx.beginPath();
        for (let i = 0; i < leftEyebrow.length; i++) {
            const pt = landmarks[leftEyebrow[i]];
            const x = pt.x * width;
            const y = pt.y * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Right eyebrow
        ctx.beginPath();
        for (let i = 0; i < rightEyebrow.length; i++) {
            const pt = landmarks[rightEyebrow[i]];
            const x = pt.x * width;
            const y = pt.y * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // =========================
        // Draw eyeliner
        // =========================
        const leftEyeliner = [33, 7, 163, 144, 145, 153, 154, 155];
        const rightEyeliner = [263, 249, 390, 373, 374, 380, 381, 382];
    
        ctx.save();
        ctx.strokeStyle = colors.eyelinerColor;
        ctx.lineWidth = 1;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // Left eyeliner
        ctx.beginPath();
        for (let i = 0; i < leftEyeliner.length; i++) {
            const pt = landmarks[leftEyeliner[i]];
            const x = pt.x * width;
            const y = pt.y * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Right eyeliner
        ctx.beginPath();
        for (let i = 0; i < rightEyeliner.length; i++) {
            const pt = landmarks[rightEyeliner[i]];
            const x = pt.x * width;
            const y = pt.y * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    
        // =========================
        // Face highlight (simplified for performance)
        // =========================
        // Simpler highlight for better performance
        if (currentFilter === 'glamour' || currentFilter === 'dramatic') {
            ctx.save();
            ctx.filter = "blur(8px)";
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            ctx.lineWidth = 3;
            
            // Nose highlight
            ctx.beginPath();
            const noseTop = landmarks[6];
            const noseTip = landmarks[4];
            ctx.moveTo(noseTop.x * width, noseTop.y * height);
            ctx.lineTo(noseTip.x * width, noseTip.y * height);
            ctx.stroke();
            
            ctx.restore();
        }
    }, [currentFilter]);

    // Main rendering loop
    useEffect(() => {
        if (!canvasRef.current || !displayVideoRef.current || !isVideoReady) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        // Make sure canvas size matches video
        if (displayVideoRef.current.videoWidth && displayVideoRef.current.videoHeight) {
            if (canvas.width !== displayVideoRef.current.videoWidth) {
                canvas.width = displayVideoRef.current.videoWidth;
            }
            if (canvas.height !== displayVideoRef.current.videoHeight) {
                canvas.height = displayVideoRef.current.videoHeight;
            }
        }
        
        const renderLoop = () => {
            const now = performance.now();
            
            // Rate limiting - only process every N milliseconds and frames
            frameCounter.current = (frameCounter.current + 1) % SKIP_FRAMES;
            if (frameCounter.current !== 0 && now - lastRenderTime.current < RENDER_INTERVAL && !shouldForceRender.current) {
                animationRef.current = requestAnimationFrame(renderLoop);
                return;
            }
            
            lastRenderTime.current = now;
            shouldForceRender.current = false;
            
            // Get face landmarks
            const faceLandmarks = detectionResults?.face?.faceLandmarks?.[0];
            
            if (faceLandmarks && faceLandmarks.length > 0) {
                // Check stability
                checkFaceStability(faceLandmarks);
                
                // Draw makeup
                drawMakeup(ctx, faceLandmarks, canvas.width, canvas.height);
            } else if (noFaceDetectedDuration > 2000) {
                // No face detected for a while, clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            
            animationRef.current = requestAnimationFrame(renderLoop);
        };
        
        animationRef.current = requestAnimationFrame(renderLoop);
        
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [
        isVideoReady, 
        detectionResults, 
        drawMakeup, 
        checkFaceStability, 
        RENDER_INTERVAL,
        SKIP_FRAMES,
        noFaceDetectedDuration
    ]);

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
