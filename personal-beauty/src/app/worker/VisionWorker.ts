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
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
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
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
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
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
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
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker/float16/1/pose_landmarker.task`,
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

// Thêm logic xử lý ưu tiên
const handleDetect = async () => {
  if (frameQueue.length > 0) {
    const { imageBitmap, timestamp, modelTypes } = frameQueue.shift()!;
    isDetecting = true;

    try {
      const results: { [key: string]: any } = {};
      
      // Ưu tiên hand detection nếu có
      if (modelTypes.includes("hand") && models.has("hand")) {
        results.hand = await models.get("hand").detectForVideo(imageBitmap, timestamp);
        
        // Nếu phát hiện tay, chỉ xử lý thêm nếu view yêu cầu
        if (results.hand?.landmarks?.length > 0) {
          const otherModels = modelTypes.filter(type => type !== "hand");
          if (otherModels.length > 0) {
            await Promise.all(otherModels.map(async (modelType) => {
              if (models.has(modelType)) {
                results[modelType] = await models.get(modelType).detectForVideo(imageBitmap, timestamp);
              }
            }));
          }
        }
      } 
      // Nếu không có hand hoặc không phát hiện tay
      else {
        await Promise.all(modelTypes.map(async (modelType) => {
          if (models.has(modelType)) {
            results[modelType] = await models.get(modelType).detectForVideo(imageBitmap, timestamp);
          }
        }));
      }

      self.postMessage({ type: "detectionResult", results });
      imageBitmap.close();
    } catch (err) {
      console.error("Detection error:", err);
      self.postMessage({ type: "detectionError", error: err.message });
    } finally {
      isDetecting = false;
      if (frameQueue.length > 0) handleDetect();
    }
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
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
      }

      if (!models.has(modelType)) {
        const { class: ModelClass, options } = modelConfigs[modelType];
        models.set(modelType, await ModelClass.createFromOptions(filesetResolver, options));
      }

      self.postMessage({ type: "initialized", success: true, modelType });
    } catch (err) {
      self.postMessage({ type: "initialized", success: false, modelType, error: (err as Error).message });
      console.log(`[VisionWorker] Error initializing model ${modelType}:`, (err as Error).message);
    }
  }

  if (type === "detect") {
    const { imageBitmap, timestamp, modelTypes } = data;
    if (frameQueue.length < 2) {
      frameQueue.push({ imageBitmap, timestamp, modelTypes });
    } else {
      // Nếu queue đầy, thay thế frame cũ bằng frame mới
      const oldestFrame = frameQueue.shift();
      if (oldestFrame?.imageBitmap) {
        oldestFrame.imageBitmap.close();
      }
      frameQueue.push({ imageBitmap, timestamp, modelTypes });
    }

    if (frameQueue.length === 0 || isDetecting) return;
    handleDetect();
    return;
  }

  if (type === "cleanup") {
    const { modelType } = data;
    if (modelType && models.has(modelType)) {
      models.get(modelType).close();
      models.delete(modelType);
      self.postMessage({ type: "cleaned", success: true, modelType });
      console.log(`[VisionWorker] Cleaned up model ${modelType}`);
    } else if (!modelType) {
      models.forEach((model) => {
        model.close();
      });
      models.clear();
      self.postMessage({ type: "cleaned", success: true });
      console.log("[VisionWorker] Cleaned up all models");
    }
  }
};
