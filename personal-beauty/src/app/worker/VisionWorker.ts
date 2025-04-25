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
  if (isDetecting || frameQueue.length === 0) return;
  const { imageBitmap, timestamp, modelTypes } = frameQueue.shift()!;
  isDetecting = true;

  try {
    const results: { [key: string]: any } = {};

    // Ưu tiên hand detection nếu có
     // Always prioritize hand detection
     const handDetected = modelTypes.includes("hand") && models.has("hand");
     if (handDetected) {
       results.hand = await models.get("hand").detectForVideo(imageBitmap, timestamp);
     }
 
     const shouldRunOthers = !handDetected || (results.hand?.landmarks?.length > 0);
     if (shouldRunOthers) {
       const otherModels = ((modelTypes || []) as any[]).filter(m => m !== "hand");
       await Promise.all(otherModels.map(async (modelType) => {
         if (models.has(modelType)) {
           results[modelType] = await models.get(modelType).detectForVideo(imageBitmap, timestamp);
         }
       }));
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
    if (frameQueue.length >= 2) {
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
