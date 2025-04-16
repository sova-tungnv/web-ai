// src/app/context/HandControlContext.tsx

"use client";

import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";
import { useWebcam } from "./WebcamContext";

interface HandControlContextType {
  onHover: (element: Element) => void;
  onClick: (element: Element) => void;
  registerElement: (element: Element) => void;
  unregisterElement: (element: Element) => void;
  isHandDetectionEnabled: boolean;
  toggleHandDetection: () => void;
  indexFingerProgress: number;
}

const HandControlContext = createContext<HandControlContextType | undefined>(undefined);

export const useHandControl = () => {
  const context = useContext(HandControlContext);
  if (!context) {
    throw new Error("useHandControl must be used within a HandControlProvider");
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
  const { isIndexFingerRaised, isHandDetectionEnabled, setIsHandDetectionEnabled } = useWebcam(); // Lấy trực tiếp từ WebcamContext
  const fistDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isClickPending = useRef(false);
  const lastFistState = useRef(false);
  const lastOpenHandState = useRef(false);
  const lastCursorPosition = useRef<{ x: number; y: number } | null>(null);
  const lastProcessedPosition = useRef<{ x: number; y: number } | null>(null);
  const elements = useRef<Set<Element>>(new Set());
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef<number>(0);
  const lastIndexFingerTime = useRef<number>(Date.now()); // Theo dõi thời gian cuối cùng phát hiện ngón trỏ
  
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHandDetected, setIsHandDetected] = useState(false);

  const registerElement = useCallback((element: Element) => {
    elements.current.add(element);
    //console.log("[HandControlProvider] Registered element:", element, "Total elements:", elements.current.size);
  }, []);

  const unregisterElement = useCallback((element: Element) => {
    elements.current.delete(element);
    //console.log("[HandControlProvider] Unregistered element:", element, "Total elements:", elements.current.size);
  }, []);

  const toggleHandDetection = useCallback((enable: boolean) => {
    //console.log("[HandControlProvider] Attempting to toggle hand detection to:", enable);
    setIsHandDetectionEnabled((prev: boolean) => {
      if (prev !== enable) {
        //console.log("[HandControlProvider] Toggling hand detection:", enable);
        return enable;
      }
      //console.log("[HandControlProvider] No change in hand detection state, current:", prev);
      return prev;
    });
  }, [setIsHandDetectionEnabled]);

  // Kích hoạt/tắt hand detection dựa trên isIndexFingerRaised
  useEffect(() => {
    if (isIndexFingerRaised) {
      if (!isHandDetectionEnabled) {
        toggleHandDetection(true);
      }
      lastIndexFingerTime.current = Date.now();
    }
  }, [isIndexFingerRaised, isHandDetectionEnabled, toggleHandDetection]);


   // Tắt hand detection sau 5 giây không phát hiện ngón trỏ
   useEffect(() => {
    const checkInactivity = () => {
      // console.log("[HandControlProvider] Checking inactivity:", {
      //   isHandDetectionEnabled,
      //   isIndexFingerRaised,
      //   elapsed: Date.now() - lastIndexFingerTime.current,
      // });
      if (isHandDetectionEnabled && !isIndexFingerRaised) {
        const elapsed = Date.now() - lastIndexFingerTime.current;
        if (elapsed >= 5000) {
          console.log("[HandControlProvider] No index finger detected for 5 seconds, disabling hand detection");
          toggleHandDetection(false);
        }
      }
    };

    const intervalId = setInterval(checkInactivity, 1000);
    return () => clearInterval(intervalId);
  }, [isIndexFingerRaised, isHandDetectionEnabled, toggleHandDetection]);


  const onHover = useCallback(
    (element: Element) => {
      if (!isHandDetectionEnabled || !handData.isHandDetected) return;

      if (!handData.isFist) {
        lastCursorPosition.current = handData.cursorPosition;
      }

      const position = lastCursorPosition.current || handData.cursorPosition;

      if (
        lastProcessedPosition.current &&
        lastProcessedPosition.current.x === position.x &&
        lastProcessedPosition.current.y === position.y
      ) {
        return;
      }

      lastProcessedPosition.current = { x: position.x, y: position.y };

      const elementsAtPoint = document.elementsFromPoint(position.x, position.y);
      //console.log("[HandControlProvider] Elements at point:", elementsAtPoint);

      const targetElement = elementsAtPoint.find((el) => elements.current.has(el));

      elements.current.forEach((item) => {
        item.classList.remove("hover");
      });

      if (targetElement) {
        targetElement.classList.add("hover");
        //console.log("[HandControlProvider] Added hover to:", targetElement);
      }
    },
    [handData, isHandDetectionEnabled]
  );

  const onClick = useCallback(
    (element: Element) => {
      if (!isHandDetectionEnabled || !handData.isHandDetected) return;

      if (handData.isFist && !lastFistState.current && !isClickPending.current) {
        lastFistState.current = true;
        isClickPending.current = true;

        const clickPosition = lastCursorPosition.current || handData.cursorPosition;

        fistDebounceTimeout.current = setTimeout(() => {
          const elementAtPoint = document.elementFromPoint(clickPosition.x, clickPosition.y);
          if (elementAtPoint && elements.current.has(elementAtPoint)) {
            elementAtPoint.dispatchEvent(new Event("click", { bubbles: true }));
            console.log("[HandControlProvider] Clicked element:", elementAtPoint);
          }
          isClickPending.current = false;
        }, 150);
      } else if (!handData.isFist) {
        lastFistState.current = false;
      }
    },
    [handData, isHandDetectionEnabled]
  );

  useEffect(() => {
    if (handData.isHandDetected && handData.isOpenHand && !lastOpenHandState.current) {
      lastOpenHandState.current = true;
      if (onOpenHand) {
        console.log("[HandControlProvider] Open Hand detected, triggering callback");
        onOpenHand();
      }
    } else if (!handData.isOpenHand) {
      lastOpenHandState.current = false;
    }
  }, [handData, onOpenHand]);

  useEffect(() => {
    setIsHandDetected(handData.isHandDetected);
    if (handData.isHandDetected) {
      setCursorPosition(handData.cursorPosition);
    }
  }, [handData]);

  useEffect(() => {
    const detect = () => {
      const now = performance.now();
      if (now - lastDetectTime.current < 33) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectTime.current = now;

      if (elements.current.size === 0) {
        console.log("[HandControlProvider] No elements registered, skipping detection");
      } else {
        elements.current.forEach((element) => {
          if (!document.body.contains(element)) {
            elements.current.delete(element);
            //console.log("[HandControlProvider] Removed invalid element:", element);
          }
        });

        if (isHandDetectionEnabled) {
          elements.current.forEach((element) => {
            onHover(element);
            onClick(element);
          });
        }
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
      elements.current.forEach((item) => {
        item.classList.remove("hover");
      });
      lastFistState.current = false;
      lastOpenHandState.current = false;
      isClickPending.current = false;
      lastProcessedPosition.current = null;
      if (fistDebounceTimeout.current) {
        clearTimeout(fistDebounceTimeout.current);
      }
    }
  }, [handData]);

  return (
    <HandControlContext.Provider
      value={{ onHover, onClick, registerElement, unregisterElement, isHandDetectionEnabled, toggleHandDetection, isIndexFingerRaised }}
    >
      {children}
      {isHandDetected && isHandDetectionEnabled && (
        <div
          className={`absolute cursor w-8 h-8 rounded-full bg-pink-500 border-4 border-white pointer-events-none z-100 transition-all duration-50 ${isLoading ? "opacity-0" : "opacity-100"
            }`}
          style={{
            left: `${(cursorPosition.x / window.innerWidth) * 100}%`,
            top: `${(cursorPosition.y / window.innerHeight) * 100}%`,
          }}
        />
      )}
    </HandControlContext.Provider>
  );
};