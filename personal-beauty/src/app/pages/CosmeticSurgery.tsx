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
  const [colorTone, setColorTone] = useState<string | null>(null);
  const [eyeSuggestion, setEyeSuggestion] = useState<string | null>(null);
  const [faceSuggestion, setFaceSuggestion] = useState<string | null>(null);

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
          const foreheadPoint = landmarks[10];
          const x = foreheadPoint.x * canvas.width;
          const y = foreheadPoint.y * canvas.height;

          if (
            x >= 10 &&
            y >= 10 &&
            x + 10 <= canvas.width &&
            y + 10 <= canvas.height
          ) {
            const imageData = ctx.getImageData(x - 10, y - 10, 20, 20);
            const tone = analyzeColorTone(imageData);
            setColorTone(tone);
          } else {
            setColorTone(null);
          }
          analyzeFace(landmarks);

          drawingFaceGrid(landmarks);
        } else {
          setColorTone(null);
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

  const calculateDistance = (
    point1: NormalizedLandmark,
    point2: NormalizedLandmark
  ) => {
    return Math.sqrt(
      Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2)
    );
  };
  // Hàm phân tích khuôn mặt
  const analyzeFace = (landmarks: NormalizedLandmark[]) => {
    // Tính toán khoảng cách giữa các điểm mốc trên khuôn mặt
    const leftEyeOuter = landmarks[33];
    const leftEyeInner = landmarks[133];
    const rightEyeInner = landmarks[362];
    const rightEyeOuter = landmarks[263];
    const noseTip = landmarks[1];
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];
    const upperLip = landmarks[0];
    const lowerLip = landmarks[17];
    const chin = landmarks[152];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    // Tính toán tỷ lệ khuôn mặt
    const faceWidth = calculateDistance(leftCheek, rightCheek);
    const faceHeight = calculateDistance(landmarks[10], chin);
    const eyeDistance = calculateDistance(leftEyeInner, rightEyeInner);
    const mouthWidth = calculateDistance(leftMouth, rightMouth);
    const noseLength = calculateDistance(landmarks[168], noseTip);
    const chinHeight = calculateDistance(lowerLip, chin);

    // Phân tích cân đối khuôn mặt
    const idealFaceRatio = 1.618; // Tỷ lệ vàng
    const currentFaceRatio = faceHeight / faceWidth;
    const faceSuggestions = [];

    // Phân tích mắt
    if (eyeDistance / faceWidth < 0.25) {
      setEyeSuggestion(
        "Mắt nằm gần nhau. Hãy cân nhắc các kỹ thuật trang điểm mắt để tạo ảo giác đôi mắt rộng hơn."
      );
    } else if (eyeDistance / faceWidth > 0.3) {
      setEyeSuggestion(
        "Mắt cách xa nhau. Hãy cân nhắc các kỹ thuật trang điểm mắt để tạo ảo giác đôi mắt gần nhau hơn."
      );
    } else {
      setEyeSuggestion("Mắt có khoảng cách hợp lý. Không cần điều chỉnh.");
    }

    // Phân tích kích thước mũi
    const noseWidth = calculateDistance(landmarks[102], landmarks[331]); // Điểm rộng nhất của mũi
    const noseHeight = calculateDistance(landmarks[168], noseTip); // Chiều cao mũi
    const noseBase = calculateDistance(landmarks[198], landmarks[420]); // Cánh mũi

    if (noseWidth / faceWidth > 0.35) {
      faceSuggestions.push("Mũi có vẻ rộng. Hãy cân nhắc thu gọn cánh mũi.");
    } else if (noseWidth / faceWidth < 0.25) {
      faceSuggestions.push(
        "Mũi có vẻ hẹp. Có thể cân nhắc nâng mũi để cân đối hơn."
      );
    }

    if (noseHeight / faceHeight > 0.33) {
      faceSuggestions.push("Mũi có vẻ cao so với khuôn mặt.");
    } else if (noseHeight / faceHeight < 0.27) {
      faceSuggestions.push("Mũi có vẻ thấp. Có thể cân nhắc nâng mũi.");
    }

    if (noseBase / noseHeight > 0.9) {
      faceSuggestions.push("Đầu mũi có vẻ to. Hãy cân nhắc thu gọn đầu mũi.");
    }

    // Phân tích gò má
    const cheekboneWidth = calculateDistance(leftCheek, rightCheek);
    const cheekboneHeight = calculateDistance(landmarks[234], landmarks[111]); // Độ cao gò má
    const cheekboneLength = calculateDistance(landmarks[234], landmarks[447]); // Chiều dài gò má

    if (cheekboneWidth / faceWidth > 0.8) {
      faceSuggestions.push(
        "Gò má khá rộng. Có thể cân nhắc thu gọn để tạo khuôn mặt thon gọn hơn."
      );
    } else if (cheekboneWidth / faceWidth < 0.65) {
      faceSuggestions.push(
        "Gò má hẹp. Có thể cân nhắc làm đầy để tạo khuôn mặt cân đối hơn."
      );
    }

    if (cheekboneHeight / faceHeight > 0.15) {
      faceSuggestions.push(
        "Gò má cao. Có thể cân nhắc điều chỉnh để hài hòa với khuôn mặt."
      );
    } else if (cheekboneHeight / faceHeight < 0.1) {
      faceSuggestions.push(
        "Gò má thấp. Có thể cân nhắc nâng gò má để tạo khối cho khuôn mặt."
      );
    }

    if (cheekboneLength / faceWidth > 0.4) {
      faceSuggestions.push(
        "Gò má dài. Có thể cân nhắc thu gọn để cân đối với khuôn mặt."
      );
    } else if (cheekboneLength / faceWidth < 0.3) {
      faceSuggestions.push(
        "Gò má ngắn. Có thể cân nhắc kéo dài để tạo đường nét thanh thoát."
      );
    }
    // Phân tích mũi và cằm
    if (noseLength / faceHeight > 0.33) {
      faceSuggestions.push(
        "Mũi có vẻ dài so với tỉ lệ khuôn mặt. Hãy cân nhắc việc chỉnh hình mũi."
      );
    }

    if (chinHeight / faceHeight < 0.2) {
      faceSuggestions.push(
        "Cằm có vẻ ngắn. Hãy cân nhắc việc cải thiện hoặc làm đầy cằm."
      );
    } else if (chinHeight / faceHeight > 0.25) {
      faceSuggestions.push("Cằm có vẻ nhô ra. Hãy cân nhắc thu gọn cằm.");
    } else {
      faceSuggestions.push("Cằm có tỷ lệ hợp lý. Không cần điều chỉnh.");
    }

    // Kiểm tra cân đối hai bên mặt
    const leftFaceWidth = calculateDistance(leftCheek, noseTip);
    const rightFaceWidth = calculateDistance(rightCheek, noseTip);
    const faceSymmetryRatio =
      Math.abs(leftFaceWidth - rightFaceWidth) /
      Math.max(leftFaceWidth, rightFaceWidth);

    if (faceSymmetryRatio > 0.1) {
      faceSuggestions.push(
        "Phát hiện sự không đối xứng trên khuôn mặt. Hãy cân nhắc tạo hình đường nét khuôn mặt."
      );
    }

    setFaceSuggestion(faceSuggestions.join(" "));

    // Gợi ý tổng quát
  };
  return (
    <AnalysisLayout
      title="Cosmetic Surgery"
      description="Analyze facial features for cosmetic surgery recommendations."
      videoRef={videoRef}
      canvasRef={canvasRef}
      result={faceSuggestion}
      error={error || webcamError}
    />
  );
}
