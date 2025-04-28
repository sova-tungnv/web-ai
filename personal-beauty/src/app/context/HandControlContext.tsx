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
  const lastProcessedPosition = useRef<{ x: number; y: number } | null>(null);
  const elements = useRef<Set<Element>>(new Set());
  const lastHandData = useRef(handData);
  const openHandStartTime = useRef<number | null>(null);
  const smoothPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cursorTarget = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastStableCursorPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastIsFist = useRef(false);
  const handDataRef = useRef(handData);

  const ALPHA = 0.2;
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

    fistDebounceTimeout.current = setTimeout(() => {
      const clicked = getElementAtCursor(cursorPosition);
      if (clicked) {
        clicked.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      }
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
      handleHandDetection();
      requestAnimationFrame(detectLoop);
    };
    requestAnimationFrame(detectLoop);
    return () => {
      if (fistDebounceTimeout.current) clearTimeout(fistDebounceTimeout.current);
    };
  }, [handleHandDetection]);

  useEffect(() => {
    const animateCursor = () => {
      const { cursorPosition, isFist, isHandDetected } = handDataRef.current;

      if (isFist) {
        if (!lastIsFist.current) {
          lastStableCursorPosition.current = cursorPosition;
        }
        cursorTarget.current = lastStableCursorPosition.current;
      } else {
        cursorTarget.current = cursorPosition;
      }

      lastIsFist.current = isFist;

      smoothPosition.current.x += (cursorTarget.current.x - smoothPosition.current.x) * ALPHA;
      smoothPosition.current.y += (cursorTarget.current.y - smoothPosition.current.y) * ALPHA;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${smoothPosition.current.x}px, ${smoothPosition.current.y}px)`;
        cursorRef.current.style.opacity = isHandDetected ? "1" : "0";
      }

      requestAnimationFrame(animateCursor);
    };
    animateCursor();
  }, []);

  useEffect(() => {
    if (!handData.isHandDetected) {
      elements.current.forEach((item) => item.classList.remove("hover"));
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
          className="absolute w-8 h-8 rounded-full pointer-events-none z-[100]"
          style={{
            background: handData.isFist
              ? "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,105,135,0.7) 50%, rgba(255,105,135,0) 80%)"
              : "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,182,193,0.7) 50%, rgba(255,182,193,0) 80%)",
            boxShadow: "0 0 10px rgba(255,182,193,0.8), 0 0 20px rgba(255,182,193,0.6)",
            width: "24px",
            height: "24px",
            opacity: handData.isHandDetected ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
      )}

    </HandControlContext.Provider>
  );
};
