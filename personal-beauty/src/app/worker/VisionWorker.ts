/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/VisionWorker.ts

import { HandLandmarker, FaceLandmarker, PoseLandmarker, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

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
        modelAssetPath: `/models/hair_segmenter.tflite`,
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
        modelAssetPath: `/models/pose_landmarker_lite.task`,
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
const MAX_QUEUE_SIZE = 5;

const isIndexRaised = (landmarks: any[]): boolean => {
  const THRESHOLD = 0.1;
  if (!landmarks || landmarks.length < 9) return false;
  return landmarks[8].y < landmarks[5].y - THRESHOLD;
};

const handleDetect = async () => {
  if (isDetecting || frameQueue.length === 0) return;

  const { imageBitmap, timestamp, modelTypes } = frameQueue.shift()!;
   // Clear các frame cũ
   while (frameQueue.length > 0) {
    const dropped = frameQueue.shift();
    dropped?.imageBitmap?.close();
  }
  isDetecting = true;
  console.log(`[VisionWorker] Start detect at ${timestamp}, modelTypes: ${modelTypes.join(", ")}`);

  try {
    const results: { [key: string]: any } = {};
    let indexRaised = false;

    if (modelTypes.includes("hand") && models.has("hand")) {
      console.log("[VisionWorker] Detecting hand...");
      const handResult = await models.get("hand").detectForVideo(imageBitmap, timestamp);
      results.hand = handResult || { landmarks: [] };

      if (handResult?.landmarks?.length > 0) {
        console.log(`[VisionWorker] Hand detected. Landmarks count: ${handResult.landmarks.length}`);
        indexRaised = isIndexRaised(handResult.landmarks[0]);
        results.hand.isIndexRaised = indexRaised;
      } else {
        console.log("[VisionWorker] No hand landmarks detected.");
        results.hand.isIndexRaised = false;
      }
    } else {
      results.hand = { landmarks: [], isIndexRaised: false };
    }

    if (!indexRaised) {
      const otherModels = modelTypes.filter((m: string) => m !== "hand");
      for (const modelType of otherModels) {
        if (models.has(modelType)) {
          console.log(`[VisionWorker] Detecting ${modelType}...`);
          results[modelType] = await models.get(modelType).detectForVideo(imageBitmap, timestamp);
        }
      }
    }

    console.log("[VisionWorker] Posting detection result to main thread.", results);
    self.postMessage({ type: "detectionResult", results });
  } catch (err) {
    console.error("[VisionWorker] Detection error:", err);
    self.postMessage({ type: "detectionError", error: (err as Error).message });
  } finally {
    imageBitmap.close();
    isDetecting = false;
    setTimeout(() => handleDetect(), 0);
  }
};

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;
  console.log(`[VisionWorker] Message received: ${type}`, data || "");

  if (type === "initialize") {
    const { modelType } = data;
    if (!modelConfigs[modelType]) {
      self.postMessage({ type: "initialized", success: false, error: `Unknown model type: ${modelType}` });
      return;
    }

    try {
      if (!filesetResolver) {
        console.log("[VisionWorker] Loading FilesetResolver...");
        filesetResolver = await FilesetResolver.forVisionTasks("/wasm");
      }

      if (!models.has(modelType)) {
        const { class: ModelClass, options } = modelConfigs[modelType];
        models.set(modelType, await ModelClass.createFromOptions(filesetResolver, options));
        console.log(`[VisionWorker] Model ${modelType} initialized successfully.`);
      }

      self.postMessage({ type: "initialized", success: true, modelType });
    } catch (err) {
      self.postMessage({ type: "initialized", success: false, modelType, error: (err as Error).message });
      console.error(`[VisionWorker] Error initializing model ${modelType}:`, err);
    }
  }

  if (type === "detect") {
    const { imageBitmap, timestamp, modelTypes } = data;
    if (frameQueue.length >= MAX_QUEUE_SIZE) {
      console.warn("[VisionWorker] Frame queue full, dropping oldest frame.");
      const dropped = frameQueue.shift();
      dropped?.imageBitmap?.close();
    }
    frameQueue.push({ imageBitmap, timestamp, modelTypes });
    console.log(`[VisionWorker] Frame queued. Queue size: ${frameQueue.length}`);
    handleDetect();
  }

  if (type === "cleanup") {
    const { modelType } = data;
    if (modelType && models.has(modelType)) {
      console.log(`[VisionWorker] Cleaning up model: ${modelType}`);
      models.get(modelType).close();
      models.delete(modelType);
      self.postMessage({ type: "cleaned", success: true, modelType });
    } else if (!modelType) {
      console.log("[VisionWorker] Cleaning up all models...");
      models.forEach((model) => model.close());
      models.clear();
      self.postMessage({ type: "cleaned", success: true });
    }
  }
};
