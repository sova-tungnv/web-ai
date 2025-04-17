// src/components/page/CosmeticSurgery.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { VIEWS } from "../constants/views";
import { useLoading } from "../context/LoadingContext";

export default function CosmeticSurgery() {
  const { stream, videoRef, error: webcamError } = useWebcam();
  const [faceSuggestions, setFaceSuggestions] = useState<string[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isFaceLandmarkerReady, setIsFaceLandmarkerReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const loading = useLoading();
  useEffect(() => {
    const initializeFaceLandmarker = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: "GPU",
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1,
          }
        );

        faceLandmarkerRef.current = faceLandmarker;
        setIsFaceLandmarkerReady(true);
        loading.setIsLoading(false);
        console.log("[CosmeticSurgery] FaceLandmarker initialized");
      } catch (err) {
        console.error(
          "[CosmeticSurgery] Error initializing FaceLandmarker:",
          err
        );
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

  useEffect(() => {
    if (
      !isFaceLandmarkerReady ||
      !stream ||
      !canvasRef.current ||
      !videoRef.current
    ) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Failed to initialize canvas.");
      return;
    }

    const waitForVideoReady = async () => {
      let retries = 5;
      while (retries > 0 && video.readyState < 4) {
        console.log(
          "[CosmeticSurgery] Video not ready, waiting... readyState:",
          video.readyState
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        retries--;
      }
    };

    const drawingFaceGrid = (landmarks: NormalizedLandmark[]) => {
      const drawingUtils = new DrawingUtils(ctx);
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: "#C0C0C070", lineWidth: 1 }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        { color: "#30FF30" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        { color: "#30FF30" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        { color: "#E0E0E0" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
        {
          color: "#E0E0E0",
        }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
        { color: "#FF3030" }
      );
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
        { color: "#30FF30" }
      );
    };

    const detect = async () => {
      if (!faceLandmarkerRef.current) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }

      await waitForVideoReady();

      if (video.readyState < 4) {
        setError("Failed to load webcam video for face detection.");
        return;
      }

      try {
        const results = await faceLandmarkerRef.current.detectForVideo(
          video,
          performance.now()
        );

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let offsetX = 0;
        let offsetY = 0;

        if (videoRatio > canvasRatio) {
          drawHeight = canvas.width / videoRatio;
          offsetY = (canvas.height - drawHeight) / 2;
        } else {
          drawWidth = canvas.height * videoRatio;
          offsetX = (canvas.width - drawWidth) / 2;
        }

        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
        // ctx.rect(0, 0, drawWidth, drawHeight);
        // ctx.fillStyle = "black";
        // ctx.fill();
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          analyzeFace(landmarks);
          // drawingFaceGrid(landmarks);
        }
      } catch (err) {
        console.error("[CosmeticSurgery] Error during face detection:", err);
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isFaceLandmarkerReady, stream]);

  const calculateDistance = (
    point1: NormalizedLandmark,
    point2: NormalizedLandmark
  ) => {
    return Math.sqrt(
      Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2)
    );
  };

  const analyzeEyes = (landmarks: NormalizedLandmark[]) => {
    // Eye position relative to nose bridge
    const noseBridge = landmarks[168];
    const leftEyeCenter = landmarks[159];
    const rightEyeCenter = landmarks[386];

    // Check eye symmetry relative to nose
    const leftEyeToNose = calculateDistance(leftEyeCenter, noseBridge);
    const rightEyeToNose = calculateDistance(rightEyeCenter, noseBridge);
    const eyeSymmetryDiff = Math.abs(leftEyeToNose - rightEyeToNose);

    // Calculate eye sizes
    const leftEyeWidth = calculateDistance(landmarks[33], landmarks[133]);
    const rightEyeWidth = calculateDistance(landmarks[362], landmarks[263]);
    const leftEyeHeight = calculateDistance(landmarks[145], landmarks[159]);
    const rightEyeHeight = calculateDistance(landmarks[374], landmarks[386]);

    // Analyze eyebrows
    const leftEyebrowThickness = calculateDistance(
      landmarks[282],
      landmarks[295]
    );
    const rightEyebrowThickness = calculateDistance(
      landmarks[52],
      landmarks[65]
    );
    const leftEyebrowLength = calculateDistance(landmarks[282], landmarks[296]);
    const rightEyebrowLength = calculateDistance(landmarks[52], landmarks[66]);

    let suggestions = [];

    // Check eye symmetry
    if (eyeSymmetryDiff > 0.02) {
      suggestions.push("<p>Mắt có sự bất đối xứng nhẹ so với sống mũi</p>");
    }

    // Check eye size
    const avgEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;
    if (avgEyeWidth < 0.03) {
      suggestions.push(
        "<p>Mắt tương đối nhỏ, có thể cân nhắc phẫu thuật mở rộng</p>"
      );
    }

    // Check eyebrow symmetry
    const eyebrowThicknessDiff = Math.abs(
      leftEyebrowThickness - rightEyebrowThickness
    );
    if (eyebrowThicknessDiff > 0.01) {
      suggestions.push(
        "<p>Lông mày không đều nhau, cần điều chỉnh để cân đối</p>"
      );
    }

    // Check eyebrow thickness
    const avgEyebrowThickness =
      (leftEyebrowThickness + rightEyebrowThickness) / 2;
    if (avgEyebrowThickness < 0.015) {
      suggestions.push(
        "<p>Lông mày khá mỏng, có thể cần cấy hoặc phun xăm</p>"
      );
    } else if (avgEyebrowThickness > 0.025) {
      suggestions.push("<p>Lông mày dày, có thể tỉa gọn để tạo form</p>");
    }

    return suggestions;
  };

  const analyzeNose = (landmarks: NormalizedLandmark[]) => {
    // Get nose bridge points
    const noseBridge = landmarks[168];
    const noseTop = landmarks[6];
    const noseTip = landmarks[1];

    // Get nostril points
    const leftNostril = landmarks[242];
    const rightNostril = landmarks[462];

    // Get face width points for proportion comparison
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const faceWidth = calculateDistance(leftCheek, rightCheek);

    // Calculate nose measurements
    const noseHeight = calculateDistance(noseTop, noseTip);
    const noseWidth = calculateDistance(leftNostril, rightNostril);
    const leftNostrialWidth = calculateDistance(noseTip, leftNostril);
    const rightNostrialWidth = calculateDistance(noseTip, rightNostril);

    let suggestions = [];

    // Check nostril symmetry
    const nostrialDifference = Math.abs(leftNostrialWidth - rightNostrialWidth);
    if (nostrialDifference > 0.01) {
      suggestions.push("<p>Hai bên cánh mũi chưa cân đối</p>");
    }

    // Check nose bridge height
    const noseBridgeHeight = calculateDistance(noseBridge, noseTip);
    if (noseBridgeHeight < 0.1) {
      suggestions.push(
        "<p>Sống mũi tương đối thấp, có thể cân nhắc nâng mũi</p>"
      );
    }

    // Check nose width proportions
    const noseToFaceRatio = noseWidth / faceWidth;
    if (noseToFaceRatio > 0.35) {
      suggestions.push("<p>Mũi hơi to so với khuôn mặt</p>");
    } else if (noseToFaceRatio < 0.2) {
      suggestions.push("<p>Mũi khá nhỏ so với khuôn mặt</p>");
    }

    return suggestions;
  };

  const analyzeCheeks = (landmarks: NormalizedLandmark[]) => {
    // Get cheekbone landmarks
    const leftCheekbone = landmarks[234];
    const rightCheekbone = landmarks[454];
    const noseBridge = landmarks[168];
    const chin = landmarks[152];

    // Calculate facial measurements
    const faceHeight = calculateDistance(landmarks[10], chin);
    const faceWidth = calculateDistance(leftCheekbone, rightCheekbone);

    // Check cheek symmetry
    const leftCheekHeight = calculateDistance(leftCheekbone, noseBridge);
    const rightCheekHeight = calculateDistance(rightCheekbone, noseBridge);
    const cheekSymmetryDiff = Math.abs(leftCheekHeight - rightCheekHeight);

    let suggestions = [];

    // Analyze cheek symmetry
    if (cheekSymmetryDiff > 0.02) {
      suggestions.push(
        "<p>Gò má hai bên không cân đối, có thể cần điều chỉnh</p>"
      );
    }

    // Analyze cheekbone prominence
    const cheekboneProminence =
      (leftCheekHeight + rightCheekHeight) / 2 / faceWidth;
    if (cheekboneProminence < 0.3) {
      suggestions.push(
        "<p>Gò má tương đối thấp, có thể cân nhắc độn gò má hoặc trang điểm tạo khối để làm nổi bật</p>"
      );
    } else if (cheekboneProminence > 0.45) {
      suggestions.push(
        "<p>Gò má cao và rõ nét, phù hợp với các kiểu trang điểm nhẹ nhàng</p>"
      );
    }

    return suggestions;
  };

  const analyzeFaceShape = (landmarks: NormalizedLandmark[]) => {
    // Get key face shape points
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const chin = landmarks[152];
    const forehead = landmarks[10];
    const leftJaw = landmarks[207];
    const rightJaw = landmarks[427];

    // Calculate face width at different levels
    const upperFaceWidth = calculateDistance(landmarks[137], landmarks[367]);
    const midFaceWidth = calculateDistance(leftCheek, rightCheek);
    const jawWidth = calculateDistance(leftJaw, rightJaw);

    // Calculate face height
    const faceHeight = calculateDistance(forehead, chin);

    let suggestions = [];

    // Check face symmetry
    const leftCheekToCenter = calculateDistance(leftCheek, landmarks[168]);
    const rightCheekToCenter = calculateDistance(rightCheek, landmarks[168]);
    const asymmetryRatio =
      Math.abs(leftCheekToCenter - rightCheekToCenter) / midFaceWidth;

    if (asymmetryRatio > 0.05) {
      suggestions.push("<p>Nhận thấy sự không cân đối nhẹ giữa hai bên má</p>");
    }

    // Analyze face width ratios
    const upperToMidRatio = upperFaceWidth / midFaceWidth;
    const jawToMidRatio = jawWidth / midFaceWidth;

    if (jawToMidRatio > 0.95) {
      suggestions.push(
        "<p>Phần hàm tương đối rộng, có thể trang điểm tạo khối để khuôn mặt thon gọn hơn</p>"
      );
    }

    if (upperToMidRatio < 0.85) {
      suggestions.push(
        "<p>Phần má hơi đầy, có thể sử dụng phấn tạo khối để khuôn mặt cân đối hơn</p>"
      );
    }

    return suggestions;
  };
  const analyzeLips = (landmarks: NormalizedLandmark[]) => {
    // Get key lip points
    const upperLipCenter = landmarks[0];
    const lowerLipCenter = landmarks[17];
    const leftLipCorner = landmarks[61];
    const rightLipCorner = landmarks[291];
    const upperLipTop = landmarks[13];
    const lowerLipBottom = landmarks[14];

    let suggestions = [];

    // Check lip symmetry
    const leftLipWidth = calculateDistance(leftLipCorner, upperLipCenter);
    const rightLipWidth = calculateDistance(rightLipCorner, upperLipCenter);
    const lipAsymmetry = Math.abs(leftLipWidth - rightLipWidth);

    if (lipAsymmetry > 0.015) {
      suggestions.push(
        "<p>Môi có sự bất đối xứng nhẹ, có thể cần điều chỉnh</p>"
      );
    }

    // Check lip proportions
    const lipHeight = calculateDistance(upperLipTop, lowerLipBottom);
    const lipWidth = calculateDistance(leftLipCorner, rightLipCorner);
    const lipRatio = lipHeight / lipWidth;

    if (lipRatio < 0.3) {
      suggestions.push(
        "<p>Môi khá mỏng, có thể cân nhắc tiêm filler để tăng độ đầy</p>"
      );
    }

    // Check jaw alignment
    const leftJaw = landmarks[207];
    const rightJaw = landmarks[427];
    const jawlineAngle = Math.abs(leftJaw.y - rightJaw.y);

    if (jawlineAngle > 0.02) {
      suggestions.push(
        "<p>Xương hàm không đều, có thể cân nhắc phẫu thuật chỉnh nha để cân đối</p>"
      );
    }

    return suggestions;
  };

  // Add analyzeEyes to analyzeFace function
  const analyzeFace = (landmarks: NormalizedLandmark[]) => {
    // ... existing measurements ...

    const suggestions = [
      ...analyzeEyes(landmarks),
      ...analyzeCheeks(landmarks),
      ...analyzeNose(landmarks),
      ...analyzeFaceShape(landmarks),
      ...analyzeLips(landmarks),
    ];
    setFaceSuggestions(suggestions);
    // ... rest of the function ...
  };

  return (
    <div>
      <AnalysisLayout
        title="Cosmetic Surgery"
        description="Analyze facial features for cosmetic surgery recommendations."
        videoRef={videoRef}
        canvasRef={canvasRef}
        result={faceSuggestions?.join("") || null}
        error={error || webcamError}
      />
      <>{faceSuggestions}</>
    </div>
  );
}
