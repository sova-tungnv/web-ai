// src/app/context/HandControlContext.tsx

"use client";

import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";
import { useWebcam } from "./WebcamContext";

interface HandControlContextType {
  onHover: () => void;
  onClick: () => void;
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
  const { isHandDetectionEnabled, setIsHandDetectionEnabled, cursorRef } = useWebcam();
  const fistDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isClickPending = useRef(false);
  const lastFistState = useRef(false);
  const lastProcessedPosition = useRef<{ x: number; y: number } | null>(null);
  const elements = useRef<Set<Element>>(new Set());
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef<number>(0);
  const lastHandData = useRef(handData);
  const openHandStartTime = useRef<number | null>(null);

  const handDataRef = useRef(handData);
  useEffect(() => {
    handDataRef.current = handData;
  }, [handData]);

  const getElementAtCursor = (cursorPosition: { x: number; y: number }): Element | undefined => {
    const elementsAtPoint = document.elementsFromPoint(cursorPosition.x, cursorPosition.y);
    return elementsAtPoint.find((el) => elements.current.has(el));
  };

  const registerElement = useCallback((element: Element) => {
    elements.current.add(element);
  }, []);

  const unregisterElement = useCallback((element: Element) => {
    elements.current.delete(element);
  }, []);

  const toggleHandDetection = useCallback((enable: boolean) => {
    setIsHandDetectionEnabled((prev: boolean) => (prev !== enable ? enable : prev));
  }, [setIsHandDetectionEnabled]);

  const onHover = useCallback(() => {
    const { isHandDetected, isFist, cursorPosition } = handDataRef.current;
    if (!isHandDetectionEnabled || !isHandDetected || isFist) return;

    const positionChanged =
      !lastProcessedPosition.current ||
      lastProcessedPosition.current.x !== cursorPosition.x ||
      lastProcessedPosition.current.y !== cursorPosition.y;

    if (!positionChanged) return;
    lastProcessedPosition.current = { ...cursorPosition };

    const hovered = getElementAtCursor(cursorPosition);
    elements.current.forEach((el) => el.classList.remove("hover"));
    if (hovered) hovered.classList.add("hover");
  }, [isHandDetectionEnabled]);

  const onClick = useCallback(() => {
    const { isHandDetected, isFist, cursorPosition } = handDataRef.current;
    if (!isHandDetectionEnabled || !isHandDetected || !isFist || isClickPending.current) return;

    isClickPending.current = true;
    lastFistState.current = true;

    fistDebounceTimeout.current = setTimeout(() => {
      const clicked = getElementAtCursor(cursorPosition);
      if (clicked) {
        clicked.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      }
      lastFistState.current = false;
      isClickPending.current = false;
    }, 200);
  }, [isHandDetectionEnabled]);

  const handleHandDetection = useCallback(() => {
    const current = handDataRef.current;
    if (!isHandDetectionEnabled || elements.current.size === 0) return;

    const changed =
      lastHandData.current.isHandDetected !== current.isHandDetected ||
      lastHandData.current.cursorPosition.x !== current.cursorPosition.x ||
      lastHandData.current.cursorPosition.y !== current.cursorPosition.y ||
      lastHandData.current.isFist !== current.isFist;

    if (!changed) return;

    if (current.isFist) onClick();
    else if (current.isHandDetected) onHover();
    else elements.current.forEach((el) => el.classList.remove("hover"));

    lastHandData.current = { ...current };
  }, [onClick, onHover, isHandDetectionEnabled]);

  useEffect(() => {
    const detectLoop = () => {
      const now = performance.now();
      const minInterval = handDataRef.current.isHandDetected ? 33 : 100;
      if (now - lastDetectTime.current < minInterval) {
        animationFrameId.current = requestAnimationFrame(detectLoop);
        return;
      }

      lastDetectTime.current = now;
      handleHandDetection();
      animationFrameId.current = requestAnimationFrame(detectLoop);
    };

    animationFrameId.current = requestAnimationFrame(detectLoop);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (fistDebounceTimeout.current) clearTimeout(fistDebounceTimeout.current);
    };
  }, [handleHandDetection]);

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

  useEffect(() => {
    if (!isHandDetectionEnabled) return;

    if (handData.isHandDetected && handData.isOpenHand) {
      if (!openHandStartTime.current) {
        openHandStartTime.current = performance.now();
      } else if (performance.now() - openHandStartTime.current >= 2000) {
        onOpenHand?.();
        openHandStartTime.current = null;
      }
    } else {
      openHandStartTime.current = null;
    }
  }, [handData, isHandDetectionEnabled, onOpenHand]);

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
      {handDataRef.current.isHandDetected && isHandDetectionEnabled && (
        <div
          ref={cursorRef}
          className={`absolute w-8 h-8 rounded-full bg-pink-500 border-4 border-white pointer-events-none z-[100] transition-all duration-100 ${isLoading ? "opacity-0" : "opacity-100"}`}
          style={{
            transform: `translate(${handDataRef.current.cursorPosition.x}px, ${handDataRef.current.cursorPosition.y}px)`,
            backgroundColor: handDataRef.current.isFist ? "#28a745" : "#ff69b4", // Đổi màu con trỏ khi fist
          }}
        />
      )}
    </HandControlContext.Provider>
  );
};
