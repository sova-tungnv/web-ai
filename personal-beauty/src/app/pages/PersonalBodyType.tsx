/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { VIEWS } from "../constants/views";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";

export default function PersonalBody() {
    const {
        stream,
        error: webcamError,
        detectionResults,
        setCurrentView,
    } = useWebcam();
    const { setIsLoading } = useLoading();
    const [error, setError] = useState<string | null>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>(
        "Initializing camera..."
    );
    const [progress, setProgress] = useState<number>(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const lastDrawTime = useRef(0);
    const [bodySuggestion, setBodySuggestion] = useState<any | null>(null);
    const [distanceWaist, setDistanceWaist] = useState<any | null>(null);
    const [distanceHips, setDistanceHips] = useState<any | null>(null);
    const [guideMsg, setGuideMsg] = useState<string>("");
    const MSG_CHECK = "put your hands";
    useEffect(() => {
        setCurrentView(VIEWS.PERSONAL_BODY_TYPE);
    }, []);

    useEffect(() => {
        if (stream && displayVideoRef.current) {
            displayVideoRef.current.srcObject = stream;
            displayVideoRef.current.onloadedmetadata = () => {
                displayVideoRef.current!.play().catch((err) => {
                    console.error("[PersonalBody] Error playing video:", err);
                });
                setIsVideoReady(true);
                setIsLoading(false);
                setStatusMessage("Please keep your body steady for analysis!");
                setProgress(20);
            };
        }
    }, [stream, setIsLoading]);

    type Landmark = { x: number; y: number; z?: number };
    function distance(a: Landmark, b: Landmark): number {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    // Giữ nguyên tay tại eo trong 3 giây để do khoảng cách eo
    const [handStillStartTime, setHandStillStartTime] = useState<number | null>(
        null
    );
    const [areBothHandsHeld, setAreBothHandsHeld] = useState(false);

    const previousLeftHand = useRef<Landmark | null>(null);
    const previousRightHand = useRef<Landmark | null>(null);
    function isHandStable(
        current: Landmark,
        previous: Landmark,
        threshold = 0.07
    ): boolean {
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        return Math.sqrt(dx * dx + dy * dy) < threshold;
    }

    function detectDistanceWaistAndHips(landmarks: Landmark[]) {
        setStatusMessage(
            distanceWaist
                ? "Put your hands on your hips."
                : "Put your hands on your waist"
        );
        setProgress(distanceWaist ? 60 : 40);

        if (landmarks?.length < 33) return;
        const leftWrist = landmarks[15] || null;
        const rightWrist = landmarks[16] || null;

        if (leftWrist && rightWrist) {
            const leftStable =
                previousLeftHand.current &&
                isHandStable(leftWrist, previousLeftHand.current);
            const rightStable =
                previousRightHand.current &&
                isHandStable(rightWrist, previousRightHand.current);

            if (leftStable && rightStable) {
                if (!handStillStartTime) {
                    setHandStillStartTime(performance.now());
                } else if (
                    performance.now() - handStillStartTime >= 3000 &&
                    !areBothHandsHeld
                ) {
                    setAreBothHandsHeld(true);
                    distanceWaist
                        ? setDistanceHips(
                              Math.abs(distance(leftWrist, rightWrist))
                          )
                        : setDistanceWaist(
                              Math.abs(distance(leftWrist, rightWrist))
                          );

                    setStatusMessage(
                        distanceHips
                            ? "Get distence hips success"
                            : "Put your hands on your hips."
                    );
                    setProgress(distanceHips ? 80 : 60);
                }
            } else {
                // Một trong hai tay di chuyển → reset
                setHandStillStartTime(null);
                setAreBothHandsHeld(false);
            }

            previousLeftHand.current = leftWrist;
            previousRightHand.current = rightWrist;
        }
    }

    function analyzeBodyShape(landmarks: Landmark[]): string {
        if (landmarks.length < 33)
            return "⚠️ Not enough data to analyze, please stand in the center of the frame.";

        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];

        const shoulderWidth = distance(leftShoulder, rightShoulder);

        const ratio = shoulderWidth / distanceHips;

        const suggestions = [];
        if (
            Math.abs(shoulderWidth - distanceHips) < 0.05 &&
            Math.abs(distanceWaist - shoulderWidth) > 0.1
        ) {
            // chiều rộng vai (shoulderWidth) gần bằng chiều rộng hông (distanceHips) và chiều rộng eo (distanceWaist) khác biệt rõ rệt so với chiều rộng va
            suggestions.push(
                "⏳ You have an hourglass body shape, so you should choose body-hugging dresses or those with a cinched waist to accentuate your figure and highlight your alluring waistline."
            );
        } else if (Math.abs(shoulderWidth - distanceHips) < 0.02) {
            // chiều rộng vai và hông gần như bằng nhau
            suggestions.push(
                "📏 You have a rectangular body shape, so opt for outfits with accents at the waist, such as peplum dresses or tops with a cinched waist, to create soft, feminine curves."
            );
        } else if (ratio > 1.1) {
            // vai sẽ rộng hơn hông
            suggestions.push(
                "🔻 You have an inverted triangle body shape, so you should choose flared skirts or wide-leg pants to balance out your broad shoulders."
            );
        } else if (
            distanceHips > shoulderWidth + 0.05 &&
            Math.abs(distanceWaist - distanceHips) < 0.05
        ) {
            // chiều rộng hông lớn hơn chiều rộng vai một chút (với một độ lệch hợp lý) và phần eo gần bằng hông
            suggestions.push(
                "🍐 You have a pear-shaped body, so opt for outfits that highlight your shoulders, such as wide necklines or puff-sleeved tops, to balance your lower body."
            );
        } else if (
            distanceWaist > shoulderWidth + 0.05 &&
            distanceWaist > distanceHips + 0.05
        ) {
            // phần eo rộng hơn nhiều so với vai và hông
            suggestions.push(
                "🍎 You have an apple-shaped body, so go for lightly flowing outfits that avoid emphasizing the waist and prioritize designs that create a slimmer appearance."
            );
        } else {
            suggestions.push(
                "It is difficult to determine your exact body shape."
            );
        }
        return suggestions.join(`<br/>`);
    }

    const actionButtons = useMemo(
        () => (
            <>
                <button
                    className={`bg-pink-500 text-white px-12 py-6 rounded-lg text-3xl hover:bg-pink-600 transition relative`}
                    onClick={() => {
                        setDistanceHips(null);
                        setDistanceWaist(null);
                        setBodySuggestion(null);
                    }}
                >
                    Refresh
                </button>
            </>
        ),
        []
    );

    useEffect(() => {
        if (
            !stream ||
            !canvasRef.current ||
            !displayVideoRef.current ||
            !isVideoReady
        ) {
            console.log(
                "[PersonalBody] Waiting for PoseLandmarker or webcam..."
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

        const drawingUtils = new DrawingUtils(ctx);

        let drawWidth: number,
            drawHeight: number,
            offsetX: number,
            offsetY: number;

        const draw = async () => {
            const now = performance.now();
            if (now - lastDrawTime.current < 1000 / 60) {
                // Giới hạn 60 FPS
                animationFrameId.current = requestAnimationFrame(draw);
                return;
            }
            lastDrawTime.current = now;

            // Cập nhật thời gian cho hiệu ứng nhấp nháy
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

            let lastVideoTime = -1;
            if (lastVideoTime !== video.currentTime && detectionResults.pose) {
                lastVideoTime = video.currentTime;

                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                for (const landmark of detectionResults.pose.landmarks) {
                    drawingUtils.drawLandmarks(landmark, {
                        radius: (data: any) =>
                            DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
                    });
                    drawingUtils.drawConnectors(
                        landmark,
                        PoseLandmarker.POSE_CONNECTIONS
                    );
                }
                ctx.restore();
            }

            if (detectionResults.pose && detectionResults.pose.landmarks) {
                const landmarks = detectionResults.pose.landmarks[0];
                detectDistanceWaistAndHips(landmarks);
                detectDistanceWaistAndHips(landmarks);
                if (distanceWaist && distanceHips) {
                    if (!bodySuggestion) {
                        setBodySuggestion(analyzeBodyShape(landmarks));
                    }
                    setProgress(100);
                    setStatusMessage("Analysis your body success");
                }
            }

            animationFrameId.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [stream, isVideoReady, detectionResults]);

    useEffect(() => {
        if (statusMessage && statusMessage.toLowerCase().includes(MSG_CHECK)) {
            if (distanceWaist && !distanceHips) {
                setGuideMsg("Hold both hands steady for 3 seconds at the hips");
            } else if (distanceWaist && distanceHips) {
                setGuideMsg("");
            } else {
                setGuideMsg(
                    "Hold both hands steady for 3 seconds at the waist"
                );
            }
        } else {
            setGuideMsg("");
        }
    }, [statusMessage, distanceWaist, distanceHips]);

    return (
        <AnalysisLayout
            title="Personal body"
            description="Analyze your personal body using live video."
            videoRef={displayVideoRef}
            canvasRef={canvasRef}
            result={bodySuggestion}
            error={error || webcamError}
            detectionResults={detectionResults}
            statusMessage={statusMessage}
            actionButtons={
                distanceWaist && distanceHips ? actionButtons : undefined
            }
            guideMessage={guideMsg}
            progress={progress}
        />
    );
}
