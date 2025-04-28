/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/worker/FaceWorker.ts
// Worker riêng cho phát hiện khuôn mặt với hiệu suất cao - siêu tối ưu

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Biến và cấu hình toàn cục
let faceLandmarker: FaceLandmarker | null = null;
let filesetResolver: any = null;
let isProcessing = false;
let isInitializing = false;
const frameQueue: { imageBitmap: ImageBitmap, timestamp: number }[] = [];
const MAX_QUEUE_SIZE = 1; // Chỉ giữ frame mới nhất

// Hiệu suất - Giảm tần suất xuống 3 FPS để tiết kiệm CPU hơn nữa
let lastProcessTime = 0;
const PROCESS_THROTTLE = 333; // ~3fps - giảm xuống từ 15fps để giảm CPU

// Cache kết quả
let lastDetectedLandmarks: any = null;
let detectionFailures = 0;
const MAX_FAILURES = 3; // Số lần thất bại trước khi gửi null
let isActive = true; // Biến để theo dõi trạng thái hoạt động
let inactiveTime = 0; // Thời gian không hoạt động (giây)
let watchdogTimer: any = null;

// Cấu hình mô hình - siêu tiết kiệm
const MODEL_CONFIGS = {
  ultraLightweight: { // Thêm cấu hình siêu nhẹ
    minFaceDetectionConfidence: 0.2,
    minFacePresenceConfidence: 0.2,
    minTrackingConfidence: 0.2,
  },
  performance: {
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
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

// Cấu hình hiện tại - sử dụng ultraLightweight cho máy yếu
let currentConfig = { ...MODEL_CONFIGS.ultraLightweight };

// Theo dõi số bỏ qua frame liên tiếp để kiểm soát tần suất xử lý
let skipFrames = 0;
const MAX_CONSECUTIVE_FRAMES = 3; // Xử lý tối đa số frame liên tiếp trước khi nghỉ

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
      outputFaceBlendshapes: false, // Tắt để giảm xử lý
      runningMode: "VIDEO",
      numFaces: 1, // Chỉ phát hiện 1 khuôn mặt
      minFaceDetectionConfidence: currentConfig.minFaceDetectionConfidence,
      minFacePresenceConfidence: currentConfig.minFacePresenceConfidence,
      minTrackingConfidence: currentConfig.minTrackingConfidence
    });

    // Thiết lập watchdog timer để theo dõi hoạt động
    setupWatchdog();

    return faceLandmarker;
  } catch (error) {
    console.error("Error initializing face model:", error);
    throw error;
  }
};

// Thiết lập watchdog để theo dõi hoạt động
function setupWatchdog() {
  // Dọn dẹp timer cũ nếu có
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
  }

  // Tạo timer mới kiểm tra mỗi giây
  watchdogTimer = setInterval(() => {
    // Nếu đang xử lý, đặt lại thời gian không hoạt động
    if (isProcessing) {
      inactiveTime = 0;
      return;
    }

    // Tăng thời gian không hoạt động
    inactiveTime++;

    // Nếu không hoạt động quá 10 giây, tạm dừng xử lý
    if (inactiveTime > 10 && isActive) {
      isActive = false;
      self.postMessage({ 
        type: "statusUpdate", 
        status: "inactive",
        message: "Face detection paused due to inactivity"
      });
    }

    // Nếu không hoạt động quá 60 giây, giải phóng mô hình để tiết kiệm bộ nhớ
    if (inactiveTime > 60 && faceLandmarker) {
      try {
        faceLandmarker.close();
        faceLandmarker = null;
        self.postMessage({ 
          type: "statusUpdate", 
          status: "released",
          message: "Face model released to save memory"
        });
      } catch (e) {
        console.error("Error releasing face model:", e);
      }
    }
  }, 1000);
}

// Cập nhật cấu hình
const updateModelConfig = async (configName: 'ultraLightweight' | 'performance' | 'balanced' | 'accuracy') => {
  if (!faceLandmarker) return;
  
  currentConfig = { ...MODEL_CONFIGS[configName] };
  
  faceLandmarker.close();
  await initializeModel();
};

// Tối ưu ảnh trước khi xử lý - giảm kích thước
function optimizeImageBitmap(imageBitmap: ImageBitmap): ImageBitmap {
  // Nếu kích thước đã nhỏ, không cần tối ưu thêm
  if (imageBitmap.width <= 160 && imageBitmap.height <= 120) {
    return imageBitmap;
  }
  
  try {
    // Tạo canvas nhỏ hơn để giảm kích thước ảnh
    const canvas = new OffscreenCanvas(160, 120); // Chỉ 160x120 cho phát hiện khuôn mặt
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return imageBitmap;
    
    // Vẽ ảnh gốc lên canvas thu nhỏ
    ctx.drawImage(imageBitmap, 0, 0, 160, 120);
    
    // Tạo bitmap mới từ canvas nhỏ
    return canvas.transferToImageBitmap();
  } catch (e) {
    console.error("Error optimizing image bitmap:", e);
    return imageBitmap;
  }
}

// Xử lý frame
const processFrame = async () => {
  if (frameQueue.length === 0 || isProcessing || !faceLandmarker || !isActive) return;
  
  const now = performance.now();
  if (now - lastProcessTime < PROCESS_THROTTLE) {
    // Lập lịch xử lý sau nếu chưa đến thời gian
    setTimeout(processFrame, PROCESS_THROTTLE - (now - lastProcessTime));
    return;
  }
  
  // Tăng số frame đã xử lý liên tiếp
  skipFrames++;
  
  // Nếu đã xử lý quá nhiều frame liên tiếp, nghỉ một chút để giảm CPU
  if (skipFrames >= MAX_CONSECUTIVE_FRAMES) {
    skipFrames = 0;
    setTimeout(processFrame, PROCESS_THROTTLE * 2); // Nghỉ dài gấp đôi
    return;
  }
  
  isProcessing = true;
  lastProcessTime = now;
  inactiveTime = 0; // Đặt lại thời gian không hoạt động
  
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
    // Kiểm tra kích thước bitmap
    if (imageBitmap.width <= 0 || imageBitmap.height <= 0) {
      throw new Error("Invalid bitmap dimensions (width or height <= 0)");
    }
    
    // Tối ưu kích thước bitmap
    const optimizedBitmap = optimizeImageBitmap(imageBitmap);
    
    // Thực hiện phát hiện
    const results = faceLandmarker.detectForVideo(optimizedBitmap, timestamp);
    
    // Nếu dùng bitmap đã tối ưu khác với bitmap gốc, đóng bitmap gốc
    if (optimizedBitmap !== imageBitmap) {
      try {
        imageBitmap.close();
      } catch (e) {
        console.error("Error closing original bitmap:", e);
      }
    }
    
    // Nếu có kết quả landmarks
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      // Làm giảm kích thước dữ liệu landmarks
      const simplifiedLandmarks = simplifyLandmarks(results.faceLandmarks[0]);
      const simplifiedResults = {
        ...results,
        faceLandmarks: [simplifiedLandmarks]
      };
      
      // Lưu kết quả để sử dụng nếu detection thất bại trong tương lai
      lastDetectedLandmarks = simplifiedResults.faceLandmarks;
      detectionFailures = 0;
      
      // Gửi kết quả về main thread
      self.postMessage({ 
        type: "detectionResult", 
        results: { face: simplifiedResults },
        timestamp,
        cachedResult: false
      });
    } else {
      // Không phát hiện khuôn mặt
      detectionFailures++;
      
      // Nếu có landmarks trước đó và số lần thất bại chưa quá ngưỡng,
      // sử dụng kết quả trước đó để tránh nhấp nháy
      if (lastDetectedLandmarks && detectionFailures <= MAX_FAILURES) {
        self.postMessage({ 
          type: "detectionResult", 
          results: { 
            face: {
              faceLandmarks: lastDetectedLandmarks
            } 
          },
          timestamp,
          cachedResult: true
        });
      } else {
        self.postMessage({ 
          type: "detectionResult", 
          results: { face: { faceLandmarks: [] } },
          timestamp,
          cachedResult: false
        });
      }
    }
  } catch (err) {
    self.postMessage({ 
      type: "detectionResult", 
      error: (err as Error).message,
      timestamp 
    });
    
    // Đóng bitmap trong trường hợp lỗi
    try {
      imageBitmap.close();
    } catch (e) {
      console.error("Error closing bitmap after error:", e);
    }
  } finally {
    // Giải phóng bitmap tối ưu (nếu còn)
    try {
      optimizedBitmap?.close();
    } catch (e) {
      console.error("Error closing optimized bitmap in finally:", e);
    }
    
    isProcessing = false;
    
    // Tiếp tục xử lý frame tiếp theo nếu có
    if (frameQueue.length > 0 && isActive) {
      setTimeout(processFrame, 0);
    }
  }
};

// Hàm làm giảm số lượng landmark để giảm lưu lượng dữ liệu
function simplifyLandmarks(landmarks: any) {
  // Danh sách các landmark quan trọng cần giữ lại
  const keyPoints = [
    0, 10, 13, 14, 17, 33, 37, 39, 40, 46, 49, 50, 57, 61, 63, 65, 
    67, 69, 78, 80, 81, 82, 84, 87, 88, 91, 93, 95, 103, 105, 107, 
    109, 127, 132, 133, 136, 144, 145, 146, 148, 149, 150, 152, 155, 
    157, 158, 159, 168, 173, 178, 181, 185, 191, 234, 246, 249, 251, 
    263, 267, 269, 270, 276, 279, 280, 287, 291, 293, 295, 296, 297, 
    300, 304, 308, 310, 311, 312, 314, 317, 318, 321, 324, 334, 336, 
    345, 352, 356, 366, 373, 374, 375, 377, 378, 379, 380, 381, 382, 
    384, 385, 386, 387, 388, 397, 398, 400, 402, 405, 409, 415, 454, 466
  ];
  
  // Tạo landmarks đơn giản hóa
  const simplified: any = {};
  
  // Chỉ giữ các điểm quan trọng
  keyPoints.forEach(index => {
    simplified[index] = landmarks[index];
  });
  
  return simplified;
}

// Xử lý message từ main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data, config } = e.data;

  if (type === "initialize") {
    try {
      if (isInitializing) return;
      isInitializing = true;
      
      console.log("[FaceWorker] Initializing with ultra-lightweight config...");
      
      // Sử dụng cấu hình siêu nhẹ mặc định
      currentConfig = { ...MODEL_CONFIGS.ultraLightweight };
      
      // Nếu có cấu hình, cập nhật
      if (config && config.mode) {
        // @ts-ignore
        currentConfig = { ...MODEL_CONFIGS[config.mode] };
      }
      
      await initializeModel();
      isInitializing = false;
      isActive = true;
      inactiveTime = 0;
      
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
    // Đặt lại trạng thái hoạt động
    if (!isActive) {
      isActive = true;
      inactiveTime = 0;
      self.postMessage({ 
        type: "statusUpdate", 
        status: "active",
        message: "Face detection resumed"
      });
    }
    
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
    
    // Thêm kiểm tra kích thước bitmap trước khi xử lý
    if (!imageBitmap || imageBitmap.width <= 0 || imageBitmap.height <= 0) {
      console.warn("[FaceWorker] Invalid bitmap received (width or height <= 0)");
      
      // Đóng bitmap không hợp lệ
      if (imageBitmap) {
        try {
          imageBitmap.close();
        } catch (e) {
          console.error("Error closing invalid bitmap:", e);
        }
      }
      
      return;
    }
    
    // Tích cực quản lý hàng đợi - đặc biệt quan trọng với máy yếu
    // Nếu đã có > 3 frame trong hàng đợi, bỏ qua frame này hoàn toàn
    if (frameQueue.length > 3) {
      try {
        imageBitmap.close();
      } catch (e) {
        console.error("Error closing skipped bitmap due to full queue:", e);
      }
      return;
    }
    
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
    if (!isProcessing && isActive) {
      setTimeout(processFrame, 0);
    }
  }

  else if (type === "setActive") {
    // Cho phép bật/tắt xử lý từ bên ngoài
    isActive = data.active;
    
    if (isActive) {
      inactiveTime = 0;
      self.postMessage({ 
        type: "statusUpdate", 
        status: "active",
        message: "Face detection activated"
      });
      
      // Khởi động lại mô hình nếu đã giải phóng
      if (!faceLandmarker && !isInitializing) {
        self.onmessage(new MessageEvent("message", { 
          data: { type: "initialize" } 
        }));
      }
      
      // Tiếp tục xử lý nếu có frame đang chờ
      if (frameQueue.length > 0 && !isProcessing) {
        setTimeout(processFrame, 0);
      }
    } else {
      self.postMessage({ 
        type: "statusUpdate", 
        status: "inactive",
        message: "Face detection deactivated"
      });
    }
  }

  else if (type === "cleanup") {
    // Dọn dẹp watchdog
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
    
    // Đóng mô hình
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
    
    // Đặt lại các biến
    isActive = false;
    isProcessing = false;
    
    self.postMessage({ type: "cleaned" });
  }
};
