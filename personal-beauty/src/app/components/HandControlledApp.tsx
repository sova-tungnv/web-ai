// src/components/HandControlledApp.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import { useWebcam } from "../context/WebcamContext";
import { ViewType, VIEWS } from "../constants/views";
import LoadingOverlay from "../components/LoadingOverlay";
import { useLoading } from "../context/LoadingContext";
import { HandControlProvider } from "../context/HandControlContext";

interface HandControlledAppProps {
  children: React.ReactNode;
  onMenuSelect: (view: ViewType) => void;
}

export default function HandControlledApp({ children, onMenuSelect }: HandControlledAppProps) {
  const { error: webcamError, handData } = useWebcam();
  const { isLoading, setIsLoading } = useLoading(); // Sử dụng context
  const [isHandDetected, setIsHandDetected] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [currentView, setCurrentView] = useState<ViewType>(VIEWS.HOME);
  const fistDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isClickPending = useRef(false);
  const lastFistState = useRef(false);
  const lastOpenHandState = useRef(false);
  const lastClickPosition = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    console.log("[HandControlledApp] isHandDetected changed to:", isHandDetected);
  }, [isHandDetected]);

  useEffect(() => {
    // Nếu đang loading, không xử lý cử chỉ tay
    if (isLoading) {
      setIsHandDetected(false); // Đặt lại để ẩn con trỏ
      document.querySelectorAll(".menu-item").forEach((item) => {
        item.classList.remove("hover");
      });
      return;
    }

    setIsHandDetected(handData.isHandDetected);
    setCursorPosition(handData.cursorPosition);

    if (handData.isHandDetected) {
      const elements = document.elementsFromPoint(handData.cursorPosition.x, handData.cursorPosition.y);
      const menuItem = elements.find((el) => el.classList.contains("menu-item"));

      document.querySelectorAll(".menu-item").forEach((item) => {
        item.classList.remove("hover");
      });

      if (menuItem) {
        menuItem.classList.add("hover");
      }

      if (handData.isFist && !lastFistState.current && !isClickPending.current) {
        lastFistState.current = true;
        isClickPending.current = true;
        lastClickPosition.current = { x: handData.cursorPosition.x, y: handData.cursorPosition.y };

        fistDebounceTimeout.current = setTimeout(() => {
          const element = document.elementFromPoint(
            lastClickPosition.current!.x,
            lastClickPosition.current!.y
          );
          if (element?.classList.contains("menu-item")) {
            const view = element.getAttribute("data-view") as ViewType;
            if (view) {
              setIsLoading(true); // Bật loading qua context
              onMenuSelect(view);
              setCurrentView(view);
            }
          }
          isClickPending.current = false;
        }, 300);
      } else if (!handData.isFist) {
        lastFistState.current = false;

        if (handData.isOpenHand && !lastOpenHandState.current && currentView !== VIEWS.HOME) {
          lastOpenHandState.current = true;
          onMenuSelect(VIEWS.HOME);
          setCurrentView(VIEWS.HOME);
        } else if (!handData.isOpenHand) {
          lastOpenHandState.current = false;
        }
      }
    } else {
      document.querySelectorAll(".menu-item").forEach((item) => {
        item.classList.remove("hover");
      });
      lastFistState.current = false;
      lastOpenHandState.current = false;
      isClickPending.current = false;
      if (fistDebounceTimeout.current) {
        clearTimeout(fistDebounceTimeout.current);
      }
    }
  }, [handData, currentView, onMenuSelect, setIsLoading]);

  return (
    <div className="flex min-h-screen bg-gradient-to-r from-pink-100 to-purple-100 overflow-hidden">
      {webcamError && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white p-4 rounded-lg shadow-lg">
          {webcamError}
        </div>
      )}
      {isHandDetected && (
        <div
          className={`absolute w-8 h-8 rounded-full bg-pink-500 border-4 border-white pointer-events-none z-40 transition-all duration-50 ${isLoading ? "opacity-0" : "opacity-100"}`}
          style={{
            left: `${(cursorPosition.x / window.innerWidth) * 100}%`,
            top: `${(cursorPosition.y / window.innerHeight) * 100}%`,
          }}
        />
      )}
      <Sidebar currentView={currentView} />
      <main className="flex-1 p-0 overflow-hidden">
        <HandControlProvider handData={handData}>{children}</HandControlProvider>
      </main>
      <LoadingOverlay isLoading={isLoading} />
    </div>
  );
}