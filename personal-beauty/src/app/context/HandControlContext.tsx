// src/context/HandControlContext.tsx
"use client";

import React, { createContext, useContext, useCallback, useRef, useEffect } from "react";

interface HandControlContextType {
  onHover: (element: Element) => void;
  onClick: (element: Element) => void;
  registerElement: (element: Element) => void;
  unregisterElement: (element: Element) => void;
}

const HandControlContext = createContext<HandControlContextType | undefined>(undefined);

export const useHandControl = () => {
  const context = useContext(HandControlContext);
  if (!context) {
    throw new Error("useHandControl must be used within a HandControlProvider");
  }
  return context;
};

export const HandControlProvider: React.FC<{
  children: React.ReactNode;
  handData: { isHandDetected: boolean; cursorPosition: { x: number; y: number }; isFist: boolean };
}> = ({ children, handData }) => {
  const fistDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isClickPending = useRef(false);
  const lastFistState = useRef(false);
  const lastCursorPosition = useRef<{ x: number; y: number } | null>(null);
  const lastProcessedPosition = useRef<{ x: number; y: number } | null>(null);
  const elements = useRef<Set<Element>>(new Set());
  const animationFrameId = useRef<number | null>(null);

  // Đăng ký và hủy đăng ký phần tử
  const registerElement = useCallback((element: Element) => {
    elements.current.add(element);
  }, []);

  const unregisterElement = useCallback((element: Element) => {
    elements.current.delete(element);
  }, []);

  // Xử lý hover
  const onHover = useCallback(
    (element: Element) => {
      if (!handData.isHandDetected) return;

      // Cập nhật vị trí con trỏ nếu không phải trạng thái nắm tay
      if (!handData.isFist) {
        lastCursorPosition.current = handData.cursorPosition;
      }

      const position = lastCursorPosition.current || handData.cursorPosition;

      // Kiểm tra nếu vị trí con trỏ không thay đổi, không cần xử lý lại
      if (
        lastProcessedPosition.current &&
        lastProcessedPosition.current.x === position.x &&
        lastProcessedPosition.current.y === position.y
      ) {
        return;
      }

      lastProcessedPosition.current = { x: position.x, y: position.y };

      const elementsAtPoint = document.elementsFromPoint(position.x, position.y);
      const targetElement = elementsAtPoint.find((el) => el === element);

      // Xóa hover khỏi tất cả các phần tử
      elements.current.forEach((item) => {
        item.classList.remove("hover");
      });

      // Thêm hover vào phần tử hiện tại
      if (targetElement) {
        targetElement.classList.add("hover");
      }
    },
    [handData]
  );

  // Xử lý click
  const onClick = useCallback(
    (element: Element) => {
      if (!handData.isHandDetected) return;

      if (handData.isFist && !lastFistState.current && !isClickPending.current) {
        lastFistState.current = true;
        isClickPending.current = true;

        const clickPosition = lastCursorPosition.current || handData.cursorPosition;

        fistDebounceTimeout.current = setTimeout(() => {
          const elementAtPoint = document.elementFromPoint(clickPosition.x, clickPosition.y);
          if (elementAtPoint === element) {
            element.dispatchEvent(new Event("click", { bubbles: true }));
          }
          isClickPending.current = false;
        }, 300);
      } else if (!handData.isFist) {
        lastFistState.current = false;
      }
    },
    [handData]
  );

  // Sử dụng requestAnimationFrame để kiểm tra liên tục
  useEffect(() => {
    const detect = () => {
      elements.current.forEach((element) => {
        onHover(element);
        onClick(element);
      });

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
  }, [onHover, onClick]);

  // Cleanup khi handData thay đổi hoặc component unmount
  useEffect(() => {
    if (!handData.isHandDetected) {
      elements.current.forEach((item) => {
        item.classList.remove("hover");
      });
      lastFistState.current = false;
      isClickPending.current = false;
      lastProcessedPosition.current = null;
      if (fistDebounceTimeout.current) {
        clearTimeout(fistDebounceTimeout.current);
      }
    }
  }, [handData]);

  return (
    <HandControlContext.Provider value={{ onHover, onClick, registerElement, unregisterElement }}>
      {children}
    </HandControlContext.Provider>
  );
};