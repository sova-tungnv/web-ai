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
  const { isHandDetectionEnabled, setIsHandDetectionEnabled, cursorRef, currentView } = useWebcam();
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

  // Sửa: Lấy element dựa trên vị trí chính xác
  const getElementAtCursor = (cursorPosition: { x: number; y: number }): Element | undefined => {
    // Lấy tất cả elements tại điểm đó
    const elementsAtPoint = document.elementsFromPoint(cursorPosition.x, cursorPosition.y);
    // Tìm element đầu tiên trong danh sách đã đăng ký
    return elementsAtPoint.find((el) => elements.current.has(el));
  };

  const registerElement = useCallback((element: Element) => {
    elements.current.add(element);
  }, []);

  const unregisterElement = useCallback((element: Element) => {
    elements.current.delete(element);
  }, []);

  const toggleHandDetection = useCallback((enable: boolean) => {
    setIsHandDetectionEnabled(enable);
  }, [setIsHandDetectionEnabled]);

  // Sửa: Tối ưu hóa onHover
  const onHover = useCallback(() => {
    const { isHandDetected, isFist, cursorPosition } = handDataRef.current;
    if (!isHandDetectionEnabled || !isHandDetected || isFist) return;

    // Chỉ xử lý khi vị trí thay đổi
    const positionChanged =
      !lastProcessedPosition.current ||
      Math.abs(lastProcessedPosition.current.x - cursorPosition.x) > 3 ||
      Math.abs(lastProcessedPosition.current.y - cursorPosition.y) > 3;

    if (!positionChanged) return;
    lastProcessedPosition.current = { ...cursorPosition };

    // Lấy element tại vị trí của con trỏ
    const hovered = getElementAtCursor(cursorPosition);
    
    // Xóa hover khỏi tất cả elements trước đó
    elements.current.forEach((el) => el.classList.remove("hover"));
    
    // Thêm hover cho element hiện tại nếu có
    if (hovered) hovered.classList.add("hover");
  }, [isHandDetectionEnabled]);

  // Sửa: Cải thiện onClick để giảm độ trễ
  const onClick = useCallback(() => {
    const { isHandDetected, isFist, cursorPosition } = handDataRef.current;
    if (!isHandDetectionEnabled || !isHandDetected || !isFist || isClickPending.current) return;

    // Đánh dấu click đang chờ xử lý
    isClickPending.current = true;
    lastFistState.current = true;

    // Giảm thời gian debounce xuống 100ms (thay vì 150ms)
    fistDebounceTimeout.current = setTimeout(() => {
      const clicked = getElementAtCursor(cursorPosition);
      if (clicked) {
        // Sửa: Thêm hiệu ứng active trước khi click
        clicked.classList.add("active");
        setTimeout(() => {
          clicked.classList.remove("active");
        }, 100);
        
        // Kích hoạt sự kiện click
        clicked.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
      }
      lastFistState.current = false;
      isClickPending.current = false;
    }, 100);
  }, [isHandDetectionEnabled]);

  // Sửa: Tối ưu hóa handleHandDetection để giảm độ trễ
  const handleHandDetection = useCallback(() => {
    const current = handDataRef.current;
    if (!isHandDetectionEnabled || elements.current.size === 0) return;

    // Chỉ xử lý khi có thay đổi đáng kể
    const positionDiff = lastHandData.current.cursorPosition && current.cursorPosition ? 
      Math.abs(lastHandData.current.cursorPosition.x - current.cursorPosition.x) + 
      Math.abs(lastHandData.current.cursorPosition.y - current.cursorPosition.y) : 0;
      
    const changed =
      lastHandData.current.isHandDetected !== current.isHandDetected ||
      lastHandData.current.isFist !== current.isFist ||
      positionDiff > 3;

    if (!changed) return;

    if (current.isFist) {
      onClick();
    } else if (current.isHandDetected) {
      onHover();
    } else {
      elements.current.forEach((el) => el.classList.remove("hover"));
    }

    lastHandData.current = { ...current };
  }, [onClick, onHover, isHandDetectionEnabled]);

  // Sửa: Tăng FPS khi có tay được phát hiện
  useEffect(() => {
    const detectLoop = () => {
      const now = performance.now();
      // Tăng FPS lên 60 FPS khi có tay được phát hiện
      const minInterval = handDataRef.current.isHandDetected ? 16 : 50;
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

  // Xử lý khi tay biến mất
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

  // Xử lý khi tay mở ra
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

  // Sửa: Thêm hiệu ứng chuyển động mượt mà hơn
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
          className={`absolute w-8 h-8 rounded-full bg-pink-500 border-4 border-white pointer-events-none z-[100] ${isLoading ? "opacity-0" : "opacity-100"}`}
          style={{ 
            transform: "translate(0px, 0px)",
            transition: "opacity 0.3s ease"
          }}
        />
      )}
    </HandControlContext.Provider>
  );
};
