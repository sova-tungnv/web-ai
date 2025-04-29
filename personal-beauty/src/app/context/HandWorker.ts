/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/worker/HandWorker.ts
// Worker tối ưu cho phát hiện tay và ngón tay

import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Cache và các biến trạng thái
let handLandmarker: HandLandmarker | null = null;
let filesetResolver: any = null;
let isProcessing = false;
let isInitializing = false;
const frameQueue: { imageBitmap: ImageBitmap, timestamp: number }[] = [];
const MAX_QUEUE_SIZE = 1; // Chỉ giữ 1 frame mới nhất

// Hiệu suất timing
let lastProcessTime = 0;
const PROCESS_THROTTLE = 16; // 60fps

// Cấu hình mô hình với độ nhạy cao để phát hiện tay nhanh hơn
const MODEL_CONFIG = {
  minHandDetectionConfidence: 0.3,   // Giảm xuống để phát hiện nhanh hơn
  minHandPresenceConfidence: 0.3,    // Giảm xuống để phát hiện nhanh hơn
  minTrackingConfidence: 0.3         // Giảm xuống để theo dõi dễ dàng hơn
};

// Cache kết quả trước đó để giảm nhấp nháy
let lastValidLandmarks: any = null;
let detectionFailures = 0;
const MAX_FAILURES = 2; // Giảm xuống để phản ứng nhanh hơn với việc mất tay

// Hằng số cho phát hiện cử chỉ
const FINGER_UP_THRESHOLD = 0.035; // Giảm ngưỡng để dễ phát hiện ngón tay hơn

// Khởi tạo mô hình với cấu hình hiện tại
const initializeModel = async () => {
  if (!filesetResolver) {
    filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
    );
  }

  // Sử dụng GPU delegate để tăng tốc
  handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU" // Sử dụng GPU để tăng tốc
    },
    runningMode: "VIDEO",
    numHands: 1, // Chỉ theo dõi 1 bàn tay để tối ưu hiệu suất
    minHandDetectionConfidence: MODEL_CONFIG.minHandDetectionConfidence,
    minHandPresenceConfidence: MODEL_CONFIG.minHandPresenceConfidence,
    minTrackingConfidence: MODEL_CONFIG.minTrackingConfidence
  });
  
  return handLandmarker;
};

// Hàm phát hiện cử chỉ tay
function detectGesture(landmarks: any[]) {
  // Kiểm tra ngón trỏ có đang dơ lên không
  const indexFingerUp = isFingerUp(landmarks, 8, 5);
  
  // Kiểm tra các ngón khác có đang gập không
  const middleFingerUp = isFingerUp(landmarks, 12, 9);
  const ringFingerUp = isFingerUp(landmarks, 16, 13);
  const pinkyUp = isFingerUp(landmarks, 20, 17);
  
  // Kiểm tra ngón cái
  const thumbOut = isThumbOut(landmarks);
  
  // Xác định cử chỉ
  const isOneFingerUp = indexFingerUp && !middleFingerUp && !ringFingerUp && !pinkyUp;
  const isTwoFingersUp = indexFingerUp && middleFingerUp && !ringFingerUp && !pinkyUp;
  const isOpenHand = indexFingerUp && middleFingerUp && ringFingerUp && pinkyUp;
  const isFist = !indexFingerUp && !middleFingerUp && !ringFingerUp && !pinkyUp;
  
  // Chỉ phát hiện khi có ngón tay dơ lên
  const isHandDetected = isOneFingerUp || isTwoFingersUp || isOpenHand;
  
  return {
    isHandDetected,
    isIndexFingerUp: indexFingerUp,
    isTwoFingersUp,
    isOpenHand,
    isFist
  };
}

// Kiểm tra một ngón tay có được dơ lên không
function isFingerUp(landmarks: any[], tipIndex: number, baseIndex: number) {
  // Nếu đầu ngón tay (y-coordinate) cao hơn khớp cơ sở (thấp hơn về pixel)
  return landmarks[tipIndex].y < landmarks[baseIndex].y - FINGER_UP_THRESHOLD;
}

// Kiểm tra ngón cái có được giơ ra không
function isThumbOut(landmarks: any[]) {
  // Kiểm tra ngón cái (ngón 1) nằm ngoài lòng bàn tay
  const thumbTip = landmarks[4];
  const indexBase = landmarks[5];
  
  // Sử dụng tọa độ x thay vì y vì ngón cái di chuyển sang bên
  return thumbTip.x < indexBase.x - FINGER_UP_THRESHOLD;
}

// Tối ưu: Xử lý frame với độ ưu tiên cao nhất
const processFrame = async () => {
  if (frameQueue.length === 0 || isProcessing || !handLandmarker) return;
  
  const now = performance.now();
  if (now - lastProcessTime < PROCESS_THROTTLE) {
    // Lập lịch xử lý tiếp theo nếu chưa đến thời gian
    setTimeout(processFrame, 0);
    return;
  }
  
  isProcessing = true;
  lastProcessTime = now;
  
  // Lấy frame mới nhất
  const { imageBitmap, timestamp } = frameQueue.pop()!;
  
  // Xóa tất cả các frame cũ, vì chúng không còn giá trị
  while (frameQueue.length > 0) {
    const oldFrame = frameQueue.shift()!;
    try {
      oldFrame.imageBitmap.close();
    } catch (e) {
      console.error("Error closing bitmap:", e);
    }
  }
  
  try {
    // Thực hiện phát hiện
    const results = handLandmarker.detectForVideo(imageBitmap, timestamp);
    
    if (results.landmarks && results.landmarks.length > 0) {
      // Phát hiện cử chỉ
      const gesture = detectGesture(results.landmarks[0]);
      
      // Chỉ báo cáo phát hiện tay nếu có ngón tay dơ lên
      if (gesture.isHandDetected) {
        // Lưu landmarks hợp lệ
        lastValidLandmarks = results.landmarks;
        detectionFailures = 0;
        
        // Thêm thông tin cử chỉ vào kết quả
        const enhancedResults = {
          ...results,
          gesture
        };
        
        self.postMessage({ 
          type: "detectionResult", 
          results: { hand: enhancedResults },
          timestamp
        });
      } else {
        // Có tay nhưng không có ngón tay dơ lên - coi như không phát hiện tay
        detectionFailures++;
        
        if (detectionFailures > MAX_FAILURES) {
          // Gửi kết quả không phát hiện sau nhiều lần thất bại
          self.postMessage({ 
            type: "detectionResult", 
            results: { hand: { landmarks: [] } },
            timestamp
          });
        }
      }
    } else {
      // Không phát hiện tay
      detectionFailures++;
      
      if (detectionFailures > MAX_FAILURES) {
        // Gửi kết quả không phát hiện sau nhiều lần thất bại
        self.postMessage({ 
          type: "detectionResult", 
          results: { hand: { landmarks: [] } },
          timestamp
        });
        
        // Reset cache
        lastValidLandmarks = null;
      }
    }
  } catch (err) {
    self.postMessage({ 
      type: "detectionResult", 
      error: (err as Error).message,
      timestamp 
    });
  } finally {
    // Giải phóng bitmap
    try {
      imageBitmap.close();
    } catch (e) {
      console.error("Error closing bitmap in finally:", e);
    }
    isProcessing = false;
    
    // Tiếp tục xử lý frame tiếp theo nếu có
    if (frameQueue.length > 0) {
      requestAnimationFrame(() => processFrame());
    }
  }
};

// Xử lý message từ main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data, config } = e.data;

  if (type === "initialize") {
    try {
      if (isInitializing) return;
      isInitializing = true;
      
      console.log("[HandWorker] Initializing...");
      
      await initializeModel();
      isInitializing = false;
      
      self.postMessage({ 
        type: "initialized", 
        success: true 
      });
    } catch (err) {
      isInitializing = false;
      self.postMessage({ 
        type: "initialized", 
        success: false, 
        error: (err as Error).message 
      });
    }
  }

  else if (type === "detect") {
    // Nếu mô hình chưa được khởi tạo, bỏ qua frame
    if (!handLandmarker) {
      if (!isInitializing) {
        // Tự động khởi tạo nếu chưa
        self.postMessage({ type: "autoInitializing" });
        self.onmessage?.(new MessageEvent("message", { 
          data: { type: "initialize" } 
        }));
      }
      return;
    }

    const { imageBitmap, timestamp } = data;
    
    // Kiểm tra bitmap hợp lệ
    if (!imageBitmap || imageBitmap.width <= 0 || imageBitmap.height <= 0) {
      if (imageBitmap) {
        try {
          imageBitmap.close();
        } catch (e) {
          console.error("Error closing invalid bitmap:", e);
        }
      }
      return;
    }
    
    // Quản lý kích thước hàng đợi - giữ tối đa MAX_QUEUE_SIZE frames
    if (frameQueue.length >= MAX_QUEUE_SIZE) {
      const oldestFrame = frameQueue.shift()!;
      try {
        oldestFrame.imageBitmap.close();
      } catch (e) {
        console.error("Error closing bitmap in queue management:", e);
      }
    }
    
    // Thêm frame mới vào hàng đợi
    frameQueue.push({ imageBitmap, timestamp });
    
    // Bắt đầu xử lý nếu chưa có quá trình xử lý nào đang chạy
    if (!isProcessing) {
      requestAnimationFrame(() => processFrame());
    }
  }

  else if (type === "cleanup") {
    if (handLandmarker) {
      handLandmarker.close();
      handLandmarker = null;
    }
    
    // Xóa tất cả frame trong hàng đợi
    while (frameQueue.length > 0) {
      const frame = frameQueue.shift()!;
      try {
        frame.imageBitmap.close();
      } catch (e) {
        console.error("Error closing bitmap during cleanup:", e);
      }
    }
    
    self.postMessage({ type: "cleaned" });
  }
};