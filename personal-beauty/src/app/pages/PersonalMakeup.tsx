/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalMakeup.tsx - Component phân tích và áp dụng makeup tối ưu hóa
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { NormalizedLandmark } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";
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

// Create Selection Button component similar to PersonalColor
const FilterSelectionButton = React.memo(
    ({ 
        filter, 
        selectedFilter, 
        setSelectedFilter 
    }: { 
        filter: FilterType; 
        selectedFilter: FilterType; 
        setSelectedFilter: (filter: FilterType) => void 
    }) => {
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

        // Get display name for filter
        const displayName = (() => {
            switch (filter) {
                case "natural": return "Natural";
                case "glamour": return "Glamour";
                case "soft": return "Soft";
                case "dramatic": return "Dramatic";
                case "nude": return "Nude";
                default: return filter;
            }
        })();

        return (
            <button
                ref={buttonRef}
                className={`filter-button text-2xl min-h-[123px] font-semibold px-8 py-4 rounded-xl transition-all duration-300 transform shadow-lg ${
                    selectedFilter === filter
                        ? "bg-pink-600 text-white scale-105 border-4 border-pink-300"
                        : "bg-gray-200 text-gray-800 hover:bg-gray-300 hover:scale-105"
                }`}
                data-filter={filter}
                onClick={() => setSelectedFilter(filter)}
            >
                {displayName}
            </button>
        );
    }
);

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
    const [shouldApplyMakeup, setShouldApplyMakeup] = useState(false);

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

    // Filter descriptions - now in English
    const filterDescriptions = {
        natural: "Enhances your natural beauty with subtle enhancements",
        glamour: "Bold and striking with red lips and defined eyeliner",
        soft: "Gentle and feminine with soft pink tones",
        dramatic: "Powerful and impressive with deep color tones",
        nude: "Natural nude tones perfect for everyday wear"
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

    // Create filter buttons UI similar to PersonalColor
    const filterButtons = useMemo(() => {
        const filters: FilterType[] = ["natural", "glamour", "soft", "dramatic", "nude"];
        
        return (
            <div className="md:w-2/12 p-1 rounded-xl flex flex-col max-h-[calc(100vh-64px)] overflow-hidden">
                <div className="flex flex-col flex-wrap gap-3 w-full h-full">
                    <div className="flex flex-col gap-6">
                        {filters.map((filter) => (
                            <FilterSelectionButton 
                                key={filter} 
                                filter={filter} 
                                selectedFilter={currentFilter} 
                                setSelectedFilter={setCurrentFilter} 
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }, [currentFilter]);

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

    // Function to generate makeup suggestions based on facial analysis - now in English with updated icons
    const generateMakeupSuggestion = useCallback((features: FacialFeatures): string => {
        const suggestions: string[] = [];

        // Add current filter description
        suggestions.push(
            `<div style="margin-bottom: 10px; padding: 10px; background: rgba(255,182,193,0.2); border-radius: 8px;">
                <strong style="font-size: 1em; color: #d64161;">💄 Current Filter: ${currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)}</strong>
                <p style="margin: 5px 0 0; font-size: 0.9em;">${filterDescriptions[currentFilter]}</p>
            </div>`
        );

        // Face shape recommendation
        switch (features.faceShape) {
            case "round":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">🔄 You have a round face with soft features</strong> <br/><em style="font-size: 15px;">💄 Create subtle contours on your cheeks and jawline for a slimming effect</em>`
                );
                break;
            case "oval":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">🔄 You have an oval face with well-balanced proportions</strong> <br/>💄<em style="font-size: 15px;"> Lightly enhance your natural features to maintain your balanced look</em>`
                );
                break;
            case "square":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">🔄 You have a square face with a defined jawline</strong> <br/>💄<em style="font-size: 15px;"> Use highlighter on your forehead and chin to soften facial angles</em>`
                );
                break;
            case "heart":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">🔄 You have a heart-shaped face with a wider forehead and narrower chin</strong> <br/>💄<em style="font-size: 15px;"> Focus highlight on the forehead and apply light contour to the chin</em>`
                );
                break;
            case "long":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">🔄 You have a longer face with elegant features</strong> <br/>💄<em style="font-size: 15px;"> Apply blush horizontally to create a more balanced facial appearance</em>`
                );
                break;
        }

        // Eye distance recommendation
        if (features.eyeDistance > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Your eyes are large and set wider apart</strong> <br/>💄<em style="font-size: 15px;"> Use darker eyeliner and focus mascara on the inner corners to visually reduce the distance</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Your eyes are smaller or closer together</strong> <br/>💄<em style="font-size: 15px;">Prioritize thin eyeliner and lighter eyeshadow to make your eyes appear larger</em>`
            );
        }

        // Lip recommendation
        if (features.lipWidth > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 You have fuller lips </strong><br/> 💄<em style="font-size: 15px;"> Use matte lipstick or darker shades for a more harmonious look</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 Your lips are more petite </strong><br/> 💄<em style="font-size: 15px;"> Use glossy finishes or brighter colors to make your lips appear fuller</em>`
            );
        }

        // Nose recommendation
        if (features.noseWidth > 0.07) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Your nose is slightly wider </strong><br/> 💄<em style="font-size: 15px;"> Apply subtle contour along the sides of your nose bridge for a slimming effect</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Your nose is slim </strong><br/> 💄<em style="font-size: 15px;"> Add a touch of highlight down the bridge to enhance depth and prominence</em>`
            );
        }

        // Eyebrow recommendation
        if (features.browLength < features.eyeDistance * 1.5) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">✨ Your eyebrows are shorter and lighter </strong><br/> 💄<em style="font-size: 15px;"> Extend them slightly and create a gentle arch for a more harmonious face</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">✨ Your eyebrows are longer and well-defined </strong><br/> 💄<em style="font-size: 15px;"> Maintain their natural shape without overdrawing to avoid a harsh look</em>`
            );
        }

        // Cheekbone recommendation
        if (features.cheekboneHeight < 0.4) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">⭐ Your cheekbones are high </strong><br/> 💄<em style="font-size: 15px;"> Apply blush below the cheekbone and blend horizontally to soften the angles</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">⭐ Your cheekbones are lower </strong><br/> 💄<em style="font-size: 15px;"> Apply blush higher up and blend toward the temples for a lifting effect</em>`
            );
        }

        // Forehead recommendation
        if (features.foreheadHeight > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🌟 Your forehead is higher </strong><br/> 💄<em style="font-size: 15px;"> Use darker powder along the hairline to create the illusion of a lower forehead</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🌟 Your forehead is lower </strong><br/> 💄<em style="font-size: 15px;"> Try styling hair away from your face or highlighting the forehead for better balance</em>`
            );
        }

        return suggestions.join("<br/>");
    }, [currentFilter, filterDescriptions]);

    // Monitor face stability and handle detection
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
                setShouldApplyMakeup(true);
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
                    setShouldApplyMakeup(false);
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
                    setShouldApplyMakeup(false);
                }
            }, 500);
            
            return () => clearTimeout(timeout);
        } else if (noFaceDetectedDuration > 0) {
            setNoFaceDetectedDuration(0);
        }
    }, [detectionResults, noFaceDetectedDuration]);

    // Function to draw makeup on face
    const drawMakeup = useCallback((ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) => {
        if (!landmarks || landmarks.length < 468 || !shouldApplyMakeup) return;
        
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
    }, [currentFilter, shouldApplyMakeup]);

    // Update filter when clicking the filter button
    useEffect(() => {
        if (facialFeaturesRef.current && isFrameStable) {
            const suggestion = generateMakeupSuggestion(facialFeaturesRef.current);
            setMakeupSuggestion(suggestion);
            shouldForceRender.current = true;
        }
    }, [currentFilter, generateMakeupSuggestion, isFrameStable]);

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
                
                // Clear canvas first
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Only draw makeup if face is stable
                if (shouldApplyMakeup) {
                    // Draw makeup
                    drawMakeup(ctx, faceLandmarks, canvas.width, canvas.height);
                }
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
        noFaceDetectedDuration,
        shouldApplyMakeup
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
            selectionButtons={filterButtons}
        />
    );
}