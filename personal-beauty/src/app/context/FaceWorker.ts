/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/worker/FaceWorker.ts
// Worker riêng cho phát hiện khuôn mặt với hiệu suất cao

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Biến và cấu hình toàn cục
let faceLandmarker: FaceLandmarker | null = null;
let filesetResolver: any = null;
let isProcessing = false;
let isInitializing = false;
const frameQueue: { imageBitmap: ImageBitmap, timestamp: number }[] = [];
const MAX_QUEUE_SIZE = 1; // Chỉ giữ frame mới nhất

// Hiệu suất
let lastProcessTime = 0;
const PROCESS_THROTTLE = 66; // ~15fps - có thể chạy chậm hơn với khuôn mặt

// Cấu hình mô hình
const MODEL_CONFIGS = {
  performance: {
    minFaceDetectionConfidence: 0.2,
    minFacePresenceConfidence: 0.2,
    minTrackingConfidence: 0.2,
  },
  balanced: {
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },
  accuracy: {
    minFaceDetectionConfidence: 0.7,
    minFacePresenceConfidence: 0.7,
    minTrackingConfidence: 0.7,
  }
};

// Cấu hình hiện tại - mặc định là hiệu suất
let currentConfig = { ...MODEL_CONFIGS.performance };

// Khởi tạo mô hình
const initializeModel = async () => {
  try {
    if (!filesetResolver) {
      filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
      );
    }

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU" // Sử dụng GPU để tối ưu
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1, // Chỉ phát hiện 1 khuôn mặt
      minFaceDetectionConfidence: currentConfig.minFaceDetectionConfidence,
      minFacePresenceConfidence: currentConfig.minFacePresenceConfidence,
      minTrackingConfidence: currentConfig.minTrackingConfidence
    });

    return faceLandmarker;
  } catch (error) {
    console.error("Error initializing face model:", error);
    throw error;
  }
};

// Cập nhật cấu hình
const updateModelConfig = async (configName: 'performance' | 'balanced' | 'accuracy') => {
  if (!faceLandmarker) return;
  
  currentConfig = { ...MODEL_CONFIGS[configName] };
  
  faceLandmarker.close();
  await initializeModel();
};

// Xử lý frame
const processFrame = async () => {
  if (frameQueue.length === 0 || isProcessing || !faceLandmarker) return;
  
  const now = performance.now();
  if (now - lastProcessTime < PROCESS_THROTTLE) {
    // Lập lịch xử lý sau nếu chưa đến thời gian
    setTimeout(processFrame, 0);
    return;
  }
  
  isProcessing = true;
  lastProcessTime = now;
  
  // Lấy frame mới nhất
  const { imageBitmap, timestamp } = frameQueue.pop()!;
  
  // Xóa các frame cũ
  while (frameQueue.length > 0) {
    const oldFrame = frameQueue.shift()!;
    try {
      oldFrame.imageBitmap.close();
    } catch (e) {
      console.error("Error closing bitmap:", e);
    }
  }
  
  try {
    // Đo thời gian xử lý
    const startTime = performance.now();
    
    // Thực hiện phát hiện
    const results = faceLandmarker.detectForVideo(imageBitmap, timestamp);
    
    // Tính thời gian xử lý
    const processingTime = performance.now() - startTime;
    
    // Gửi kết quả về main thread
    self.postMessage({ 
      type: "detectionResult", 
      results: { face: results },
      timestamp,
      processingTime
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
    
    // Tiếp tục xử lý frame tiếp theo nếu có
    if (frameQueue.length > 0) {
      setTimeout(processFrame, 0);
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
      
      console.log("[FaceWorker] Initializing...");
      
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
    if (!faceLandmarker) {
      if (!isInitializing) {
        // Tự động khởi tạo nếu chưa
        self.postMessage({ type: "autoInitializing" });
        self.onmessage(new MessageEvent("message", { 
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
      setTimeout(processFrame, 0);
    }
  }

  else if (type === "cleanup") {
    if (faceLandmarker) {
      faceLandmarker.close();
      faceLandmarker = null;
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
