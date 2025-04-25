"use client";

import React, { useState, useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { golfPostureStandards, analyzePosture } from "../libs/golfData";
import { calculateAngle, getMiddlePoint, makeSmoothLandmarks } from "../libs/utils";

type ClubType = "driver" | "iron" | "wedge" | "putter" | "hybrid" | "fairway";


interface PostureAnalyzerProps {
  clubType: ClubType;
}

interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// Các cặp kết nối giữa các landmarks
const POSE_CONNECTIONS = [
  [0, 11], [0, 12], // Mũi đến vai
  [11, 12], // Vai trái đến vai phải
  [11, 13], [13, 15], // Vai trái đến khuỷu tay trái, khuỷu tay trái đến cổ tay trái
  [12, 14], [14, 16], // Vai phải đến khuỷu tay phải, khuỷu tay phải đến cổ tay phải
  [11, 23], [12, 24], // Vai đến hông
  [23, 24], // Hông trái đến hông phải
  [23, 25], [25, 27], // Hông trái đến đầu gối trái, đầu gối trái đến mắt cá chân trái
  [24, 26], [26, 28], // Hông phải đến đầu gối phải, đầu gối phải đến mắt cá chân phải
  // Cổ tay đến ngón tay
  [15, 17], [15, 19], [15, 21], // Cổ tay trái đến ngón cái, ngón trỏ, ngón út trái
  [16, 18], [16, 20], [16, 22], // Cổ tay phải đến ngón cái, ngón trỏ, ngón út phải
  // Mắt cá chân đến ngón chân
  [27, 29], [27, 31], // Mắt cá chân trái đến gót chân trái, đầu ngón chân trái
  [28, 30], [28, 32], // Mắt cá chân phải đến gót chân phải, đầu ngón chân phải
];

const PostureAnalyzer: React.FC<PostureAnalyzerProps> = ({ clubType }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [initialPositions, setInitialPositions] = useState<Landmark[] | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 540 });
  const [smoothLandmarks, setSmoothLandmarks] = useState<Landmark[] | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const smoothingFactor = 0.8; // Hệ số làm mịn

  // Điều chỉnh kích thước canvas để khớp với video và fit màn hình
  useEffect(() => {
    const updateCanvasSize = () => {
      if (videoRef.current && canvasRef.current) {
        const videoWidth = videoRef.current.videoWidth || 960;
        const videoHeight = videoRef.current.videoHeight || 540;
        const containerWidth = window.innerWidth - 200; // Trừ sidebar 200px
        const containerHeight = window.innerHeight; // Toàn bộ chiều cao màn hình

        // Tính toán kích thước để giữ tỷ lệ 16:9
        let newWidth = Math.min(containerWidth, 1200); // Giới hạn tối đa 1200px
        let newHeight = (newWidth * videoHeight) / videoWidth; // Tỷ lệ dựa trên video thực tế

        // Nếu chiều cao vượt quá màn hình, điều chỉnh lại
        if (newHeight > containerHeight) {
          newHeight = containerHeight;
          newWidth = (newHeight * videoWidth) / videoHeight;
        }

        setCanvasSize({ width: newWidth, height: newHeight });
      }
    };

    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.addEventListener("loadedmetadata", updateCanvasSize);
    }

    window.addEventListener("resize", updateCanvasSize);
    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      if (videoElement) {
        videoElement.removeEventListener("loadedmetadata", updateCanvasSize);
      }
    };
  }, []);

  // Khởi tạo PoseLandmarker
  useEffect(() => {
    const initializePoseLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
      );
      const poseLandmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      setPoseLandmarker(poseLandmarkerInstance);
    };

    initializePoseLandmarker();
  }, []);

  // Khởi tạo camera
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        })
        .catch((err) => console.error("Error accessing webcam:", err));
    }
  }, []);

  // Xử lý kết quả từ PoseLandmarker và vẽ landmarks
  useEffect(() => {
    if (!poseLandmarker || !videoRef.current || !canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext("2d");
    if (!canvasCtx) return;

    const detectPose = async () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const results = await poseLandmarker.detectForVideo(videoRef.current, performance.now());

        // Xóa canvas trước khi vẽ
        canvasCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);

        // Vẽ landmarks
        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];

          // Smooth landmarks
          const newSmoothLandmarks = makeSmoothLandmarks(landmarks, smoothLandmarks, smoothingFactor);
          setSmoothLandmarks(newSmoothLandmarks);
          setInitialPositions(landmarks);

          // Vẽ các kết nối giữa các landmarks
          canvasCtx.strokeStyle = "green";
          canvasCtx.lineWidth = 3;
          POSE_CONNECTIONS.forEach(([startIdx, endIdx]) => {
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];
            if (start && end) {
              canvasCtx.beginPath();
              canvasCtx.moveTo(start.x * canvasSize.width, start.y * canvasSize.height);
              canvasCtx.lineTo(end.x * canvasSize.width, end.y * canvasSize.height);
              canvasCtx.stroke();
            }
          });

          // // Vẽ các điểm landmark
          // landmarks.forEach((landmark: any) => {
          //   const x = landmark.x * canvasSize.width;
          //   const y = landmark.y * canvasSize.height;
          //   canvasCtx.beginPath();
          //   canvasCtx.arc(x, y, 5, 0, 2 * Math.PI);
          //   canvasCtx.fillStyle = "red";
          //   canvasCtx.fill();
          // });

          const currentTime = performance.now();
          // Update feedback every second
          if (currentTime - lastUpdateTimeRef.current >= 1000) {
            // Calculate angles based on landmarks
            // Spine Angle: between shoulder, hip and vertical axis
            const shoulderMidpoint = getMiddlePoint(newSmoothLandmarks[11], newSmoothLandmarks[12]);
            const hipMidpoint = getMiddlePoint(newSmoothLandmarks[23], newSmoothLandmarks[24]);
            const verticalPoint = { x: shoulderMidpoint.x, y: shoulderMidpoint.y - 1 }; // Điểm thẳng đứng
            const spineAngle = calculateAngle(verticalPoint, shoulderMidpoint, hipMidpoint);

            // Shoulder Angle: between left shoulder, right shoulder and horizontal axis
            const horizontalPoint = { x: newSmoothLandmarks[11].x, y: newSmoothLandmarks[11].y }; // Điểm nằm ngang
            const shoulderAngle = calculateAngle(horizontalPoint, newSmoothLandmarks[11], newSmoothLandmarks[12]);

            // Knee Angle: Between knee, ankle and get average
            const leftKneeAngle = calculateAngle(newSmoothLandmarks[23], newSmoothLandmarks[25], newSmoothLandmarks[27]);
            const rightKneeAngle = calculateAngle(newSmoothLandmarks[24], newSmoothLandmarks[26], newSmoothLandmarks[28]);
            const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

            const mockAngles = {
              spineAngle: Math.round(spineAngle),
              shoulderAngle: Math.round(shoulderAngle),
              kneeAngle: Math.round(kneeAngle),
            };

            const result = analyzePosture(clubType, mockAngles);
            const feedbackMessages = [
              `Spine Angle: ${result.spineAngle.value}° - ${result.spineAngle.message}`,
              `Shoulder Angle: ${result.shoulderAngle.value}° - ${result.shoulderAngle.message}`,
              `Knee Angle: ${result.kneeAngle.value}° - ${result.kneeAngle.message}`,
            ];
            setFeedback(feedbackMessages);
          }
        }
      }

      requestAnimationFrame(detectPose);
    };

    requestAnimationFrame(detectPose);
  }, [poseLandmarker, canvasSize, clubType]);

  return (
    <div className="posture-analyzer">
      <div className="camera-container">
        <video
          ref={videoRef}
          style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
          autoPlay
          playsInline
        />
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", top: 0, left: 0 }}
          width={canvasSize.width}
          height={canvasSize.height}
        />
        <div className="feedback-container">
          <h2>Club Type: {clubType}</h2>
          {feedback.map((item, index) => (
            <p key={index} className="feedback-item">
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PostureAnalyzer;