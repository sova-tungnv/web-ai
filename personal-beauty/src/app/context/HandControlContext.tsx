"use client";

import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";
import { useWebcam } from "./WebcamContext";

interface HandControlContextType {
  onHover: (element: Element) => void;
  onClick: (element: Element) => void;
  registerElement: (element: Element) => void;
  unregisterElement: (element: Element) => void;
  isHandDetectionEnabled: boolean;
  toggleHandDetection: (enable: boolean) => void;
}

const HandControlContext = createContext<HandControlContextType | undefined>(undefined);

export const useHandControl = () => {
  const context = useContext(HandControlContext);
  if (!context) {
    throw new Error("useHandControl must be used within HandControlProvider");
  }
  return context;
};

interface HandControlProviderProps {
  children: React.ReactNode;
  handData: { isHandDetected: boolean; cursorPosition: { x: number; y: number }; isFist: boolean; isOpenHand: boolean };
  onOpenHand?: () => void;
  isLoading?: boolean;
}

export const HandControlProvider: React.FC<HandControlProviderProps> = ({ children, handData, onOpenHand, isLoading }) => {
  const { isHandDetectionEnabled, setIsHandDetectionEnabled } = useWebcam();
  const fistDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isClickPending = useRef(false);
  const lastFistState = useRef(false);
  const lastProcessedPosition = useRef<{ x: number; y: number } | null>(null);
  const elements = useRef<Set<Element>>(new Set());
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef<number>(0);
  const lastHandData = useRef(handData);
  const lastHandDetectedTime = useRef<number>(Date.now());
  const openHandStartTime = useRef<number | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [isHandDetected, setIsHandDetected] = useState(false);

  const handDataRef = useRef(handData);
  useEffect(() => {
    handDataRef.current = handData;
  }, [handData]);

  const registerElement = useCallback((element: Element) => {
    elements.current.add(element);
  }, []);

  const unregisterElement = useCallback((element: Element) => {
    elements.current.delete(element);
  }, []);

  const toggleHandDetection = useCallback((enable: boolean) => {
    setIsHandDetectionEnabled((prev: boolean) => (prev !== enable ? enable : prev));
  }, [setIsHandDetectionEnabled]);

  const onHover = useCallback((element: Element) => {
    const currentHandData = handDataRef.current;
    if (!isHandDetectionEnabled || !currentHandData.isHandDetected || currentHandData.isFist) return;

    const position = currentHandData.cursorPosition;

    if (
      lastProcessedPosition.current &&
      lastProcessedPosition.current.x === position.x &&
      lastProcessedPosition.current.y === position.y
    ) {
      return;
    }

    lastProcessedPosition.current = { x: position.x, y: position.y };

    const elementsAtPoint = document.elementsFromPoint(position.x, position.y);
    const targetElement = elementsAtPoint.find((el) => elements.current.has(el));

    elements.current.forEach((item) => item.classList.remove("hover"));

    if (targetElement) {
      targetElement.classList.add("hover");
    }
  }, [isHandDetectionEnabled]);

  const onClick = useCallback((element: Element) => {
    const currentHandData = handDataRef.current;
    if (!isHandDetectionEnabled || !currentHandData.isHandDetected) {
      return;
    }

    if (currentHandData.isFist && !lastFistState.current && !isClickPending.current) {
      lastFistState.current = true;
      isClickPending.current = true;

      const clickPosition = currentHandData.cursorPosition;

      fistDebounceTimeout.current = setTimeout(() => {
        const elementsAtPoint = document.elementsFromPoint(clickPosition.x, clickPosition.y);
        const elementAtPoint = elementsAtPoint.find((el) => elements.current.has(el));
        if (elementAtPoint) {
          const clickEvent = new Event("click", { bubbles: true, cancelable: true });
          elementAtPoint.dispatchEvent(clickEvent);
        }
        lastFistState.current = false;
        isClickPending.current = false;
      }, 150);
    }
  }, [isHandDetectionEnabled]);

  // Detect Open Hand giữ 2s mới gọi onOpenHand
  useEffect(() => {
    if (!isHandDetectionEnabled) return;

    if (handData.isHandDetected) {
      if (handData.isOpenHand) {
        if (!openHandStartTime.current) {
          openHandStartTime.current = performance.now();
        } else {
          const elapsed = performance.now() - openHandStartTime.current;
          if (elapsed >= 2000) {
            if (onOpenHand) {
              onOpenHand();
            }
            openHandStartTime.current = null;
          }
        }
      } else {
        openHandStartTime.current = null;
      }
    } else {
      openHandStartTime.current = null;
    }
  }, [handData, isHandDetectionEnabled, onOpenHand]);

  // Update cursor position trực tiếp qua ref
  useEffect(() => {
    if (cursorRef.current && handData.isHandDetected) {
      cursorRef.current.style.transform = `translate(${handData.cursorPosition.x}px, ${handData.cursorPosition.y}px)`;
    }
  }, [handData.cursorPosition, handData.isHandDetected]);

  useEffect(() => {
    setIsHandDetected(handData.isHandDetected);
    if (handData.isHandDetected) {
      lastHandDetectedTime.current = Date.now();
    }
  }, [handData]);

  useEffect(() => {
    const detect = () => {
      const currentHandData = handDataRef.current;
      const now = performance.now();
      if (now - lastDetectTime.current < 33) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectTime.current = now;

      if (!currentHandData.isHandDetected && now - lastHandDetectedTime.current > 5000) {
        return;
      }

      if (elements.current.size > 0 && isHandDetectionEnabled) {
        const hasHandDataChanged =
          lastHandData.current.isHandDetected !== currentHandData.isHandDetected ||
          lastHandData.current.cursorPosition.x !== currentHandData.cursorPosition.x ||
          lastHandData.current.cursorPosition.y !== currentHandData.cursorPosition.y;

        const isFistChanged = lastHandData.current.isFist !== currentHandData.isFist;

        if (hasHandDataChanged && !currentHandData.isFist) {
          elements.current.forEach(onHover);
        }

        if (isFistChanged && currentHandData.isFist) {
          elements.current.forEach(onClick);
        }

        lastHandData.current = { ...currentHandData };
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    animationFrameId.current = requestAnimationFrame(detect);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (fistDebounceTimeout.current) {
        clearTimeout(fistDebounceTimeout.current);
      }
    };
  }, [onHover, onClick, isHandDetectionEnabled]);

  useEffect(() => {
    if (!handData.isHandDetected) {
      elements.current.forEach((item) => item.classList.remove("hover"));
      lastFistState.current = false;
      isClickPending.current = false;
      lastProcessedPosition.current = null;
      if (fistDebounceTimeout.current) {
        clearTimeout(fistDebounceTimeout.current);
        fistDebounceTimeout.current = null;
      }
    }
  }, [handData]);

  return (
    <HandControlContext.Provider
      value={{
        onHover,
        onClick,
        registerElement,
        unregisterElement,
        isHandDetectionEnabled,
        toggleHandDetection,
      }}
    >
      {children}
      {isHandDetected && isHandDetectionEnabled && (
        <div
          ref={cursorRef}
          className={`absolute w-8 h-8 rounded-full bg-pink-500 border-4 border-white pointer-events-none z-[100] transition-all duration-100 ${isLoading ? "opacity-0" : "opacity-100"}`}
          style={{ transform: "translate(0px, 0px)" }}
        />
      )}
    </HandControlContext.Provider>
  );
};
