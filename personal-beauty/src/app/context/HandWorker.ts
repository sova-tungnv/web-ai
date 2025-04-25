/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/worker/HandWorker.ts
// Worker tối ưu cho phát hiện tay

import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Cache và các biến trạng thái
let handLandmarker: HandLandmarker | null = null;
let filesetResolver: any = null;
let isProcessing = false;
let isInitializing = false;
const frameQueue: { imageBitmap: ImageBitmap, timestamp: number }[] = [];
const MAX_QUEUE_SIZE = 2; // Chỉ giữ 2 frame mới nhất

// Hiệu suất timing
let lastProcessTime = 0;
const PROCESS_THROTTLE = 16; // 60fps

// Cấu hình mô hình cho các trường hợp khác nhau
const MODEL_CONFIGS = {
  // Chế độ hiệu suất cao - ít chính xác nhưng nhanh hơn
  performance: {
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.2,
  },
  // Chế độ cân bằng - mặc định
  balanced: {
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  },
  // Chế độ chính xác - chậm hơn nhưng chính xác hơn
  accuracy: {
    minHandDetectionConfidence: 0.5, 
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
};

// Cấu hình hiện tại - mặc định là hiệu suất cao cho ứng dụng này
let currentConfig = { ...MODEL_CONFIGS.performance };

// Hàm cập nhật cấu hình mô hình
const updateModelConfig = async (configName: 'performance' | 'balanced' | 'accuracy') => {
  if (!handLandmarker) return;
  
  // Lưu cấu hình mới
  currentConfig = { ...MODEL_CONFIGS[configName] };
  
  // Đóng mô hình hiện tại
  handLandmarker.close();
  
  // Khởi tạo lại với cấu hình mới
  await initializeModel();
};

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
    minHandDetectionConfidence: currentConfig.minHandDetectionConfidence,
    minHandPresenceConfidence: currentConfig.minHandPresenceConfidence,
    minTrackingConfidence: currentConfig.minTrackingConfidence
  });
  
  return handLandmarker;
};

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
    // Thực hiện phát hiện với config tối ưu
    const results = handLandmarker.detectForVideo(imageBitmap, timestamp);
    
    // Tối ưu: Thêm thông tin thời gian xử lý
    const processingTime = performance.now() - now;
    
    // Gửi kết quả ngay lập tức về main thread
    self.postMessage({ 
      type: "detectionResult", 
      results: { hand: results },
      timestamp,
      processingTime,
      priority: "high" // Đánh dấu ưu tiên cao
    });
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
    
    // Tiếp tục xử lý frame tiếp theo nếu có, không có setTimeout
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
      
      // Nếu có cấu hình, cập nhật
      if (config && config.mode) {
        // @ts-ignore
        currentConfig = { ...MODEL_CONFIGS[config.mode] };
      }
      
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

  else if (type === "updateConfig") {
    if (config && config.mode) {
      try {
        // @ts-ignore
        await updateModelConfig(config.mode);
        self.postMessage({ 
          type: "configUpdated", 
          success: true, 
          mode: config.mode 
        });
      } catch (err) {
        self.postMessage({ 
          type: "configUpdated", 
          success: false, 
          error: (err as Error).message 
        });
      }
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
    
    // Quản lý kích thước hàng đợi
    if (frameQueue.length >= MAX_QUEUE_SIZE) {
      // Xóa frame cũ nhất
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