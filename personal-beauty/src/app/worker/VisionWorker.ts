/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/VisionWorker.ts

import { HandLandmarker, FaceLandmarker, PoseLandmarker, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

// Sử dụng Map thay vì Object để quản lý models
const models = new Map<string, any>();

const modelConfigs: { [key: string]: any } = {
  hand: {
    class: HandLandmarker,
    options: {
      baseOptions: {
        modelAssetPath: `/models/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    },
  },
  face: {
    class: FaceLandmarker,
    options: {
      baseOptions: {
        modelAssetPath: `/models/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: false,
      runningMode: "VIDEO",
      numFaces: 1,
    },
  },
  hair: {
    class: ImageSegmenter,
    options: {
      baseOptions: {
        modelAssetPath: "/models/hair_segmenter.tflite",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      outputCategoryMask: true,
    },
  },
  pose: {
    class: PoseLandmarker,
    options: {
      baseOptions: {
        modelAssetPath: `/models/pose_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    },
  },
};

let filesetResolver: any = null;
let isDetecting = false;
const frameQueue: any = [];
const MAX_QUEUE_SIZE = 5; // Tăng kích thước hàng đợi để tránh bỏ sót khung hình
const MAX_PROCESSING_TIME = 30; // Giới hạn thời gian xử lý mỗi khung (ms)

// Kiểm tra ngón trỏ có được giơ ra không
const isIndexRaised = (landmarks: any[]): boolean => {
  const THRESHOLD = 0.1;
  if (!landmarks || landmarks.length < 9) return false;
  return landmarks[8].y < landmarks[5].y - THRESHOLD;
};

// Thêm logic xử lý ưu tiên
const handleDetect = async () => {
  if (isDetecting || frameQueue.length === 0) return;
  const { imageBitmap, timestamp, modelTypes } = frameQueue.shift()!;
  isDetecting = true;

  try {
    const results: { [key: string]: any } = {};
    let indexRaised = false;

    // Ưu tiên hand detection nếu có
    // Always prioritize hand detection
    if (modelTypes.includes("hand") && models.has("hand")) {
      const handResult = await models.get("hand").detectForVideo(imageBitmap, timestamp);
      results.hand = handResult || { landmarks: [] };

      if (handResult?.landmarks?.length > 0) {
        indexRaised = isIndexRaised(handResult.landmarks[0]);
        results.hand.isIndexRaised = indexRaised;
      } else {
        results.hand.isIndexRaised = false;
      }
    } else {
      results.hand = { landmarks: [], isIndexRaised: false };
    }

    // ---- Phase 2: Only detect other models if indexFinger not raised ----
    if (!indexRaised) {
      const otherModels = modelTypes.filter((m: string) => m !== "hand");
      for (const modelType of otherModels) {
        if (models.has(modelType)) {
          results[modelType] = await models.get(modelType).detectForVideo(imageBitmap, timestamp);
        }
      }
    }

    self.postMessage({ type: "detectionResult", results });
  } catch (err: any) {
    console.error("Detection error:", err);
    self.postMessage({ type: "detectionError", error: err.message });
  } finally {
    imageBitmap.close();
    isDetecting = false;
    setTimeout(() => handleDetect(), 0);
  }
};

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === "initialize") {
    const { modelType } = data;
    if (!modelConfigs[modelType]) {
      self.postMessage({ type: "initialized", success: false, error: `Unknown model type: ${modelType}` });
      return;
    }

    try {
      if (!filesetResolver) {
        filesetResolver = await FilesetResolver.forVisionTasks(
          "/wasm"
        );
      }

      if (!models.has(modelType)) {
        const { class: ModelClass, options } = modelConfigs[modelType];
        models.set(modelType, await ModelClass.createFromOptions(filesetResolver, options));
      }
      console.log(`[VisionWorker] Model ${modelType} initialized successfully.`);
      self.postMessage({ type: "initialized", success: true, modelType });
    } catch (err) {
      self.postMessage({ type: "initialized", success: false, modelType, error: (err as Error).message });
      console.log(`[VisionWorker] Error initializing model ${modelType}:`, (err as Error).message);
    }
  }

  if (type === "detect") {
    const { imageBitmap, timestamp, modelTypes } = data;
    if (frameQueue.length >= MAX_QUEUE_SIZE) {
      const dropped = frameQueue.shift();
      dropped?.imageBitmap?.close();
    }
    frameQueue.push({ imageBitmap, timestamp, modelTypes });
    handleDetect();
  }

  if (type === "cleanup") {
    const { modelType } = data;
    if (modelType && models.has(modelType)) {
      models.get(modelType).close();
      models.delete(modelType);
      self.postMessage({ type: "cleaned", success: true, modelType });
    } else if (!modelType) {
      models.forEach((model) => model.close());
      models.clear();
      self.postMessage({ type: "cleaned", success: true });
    }
  }
};
