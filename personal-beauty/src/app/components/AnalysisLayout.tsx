/* eslint-disable react/display-name */
// src/app/components/AnalysisLayout.tsx

"use client";

import React, { memo, useState, useEffect, useMemo } from "react";
import { JSX, RefObject } from "react";

interface AnalysisLayoutProps {
    title: string;
    description: string;
    videoRef: RefObject<HTMLVideoElement | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    result: string | null;
    error: string | null;
    selectionButtons?: JSX.Element;
    colorPalette?: JSX.Element;
    actionButtons?: JSX.Element;
    statusMessage?: string; // Thông báo trạng thái
    progress?: number; // Thanh tiến trình
}

// Component tối ưu với memo để tránh re-renders không cần thiết
const AnalysisLayout = memo(
  ({
    title,
    description,
    videoRef,
    canvasRef,
    result,
    error,
    selectionButtons,
    colorPalette,
    actionButtons,
    statusMessage,
    progress = 0
  }: AnalysisLayoutProps) => {
    // Theo dõi trạng thái hiển thị của lỗi
    const [showError, setShowError] = useState(false);
    
    // Hiệu ứng đóng thông báo lỗi sau 5 giây
    useEffect(() => {
      if (error) {
        setShowError(true);
        const timer = setTimeout(() => {
          setShowError(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }, [error]);
    
    // Tính toán màu thanh tiến trình
    const progressColor = useMemo(() => {
      if (progress < 33) return "bg-blue-500";
      if (progress < 66) return "bg-yellow-500";
      return "bg-green-500";
    }, [progress]);
    
    return (
      <div className="flex flex-col gap-4 h-full min-h-[calc(100vh-2rem)] p-4 md:p-6 overflow-hidden bg-gradient-to-r from-pink-100 to-purple-100">
        {/* Notification Bar */}
        {showError && (
          <div 
            className="fixed top-4 right-4 bg-red-500 text-white p-3 rounded-lg shadow-md max-w-md z-50 animate-slideIn"
            onClick={() => setShowError(false)}
          >
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}
        
        {/* Status Message and Progress */}
        {(statusMessage || progress > 0) && (
          <div className="bg-white p-3 rounded-lg shadow-sm mb-2">
            {statusMessage && <p className="text-gray-700 text-sm mb-2">{statusMessage}</p>}
            {progress > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full transition-all duration-300 ${progressColor}`} 
                  style={{ width: `${progress}%` }} 
                />
              </div>
            )}
          </div>
        )}
        
        <div className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1 overflow-hidden">
          {/* Video Container - Optimized with will-change */}
          <div
            className={`${
              selectionButtons ? "md:w-7/12" : "md:w-2/3"
            } px-6 md:px-2 rounded-xl flex flex-col items-center`}
          >
            <div 
              className="relative w-full overflow-hidden rounded-xl shadow-lg border-2 border-gray-200 bg-white" 
              style={{ paddingTop: "75%" /* 480/640 = 0.75 */ }}
            >
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            </div>
          </div>
          {selectionButtons && (<>{selectionButtons}</>)}
          {/* Results Container */}
          <div
            className={`${
              selectionButtons ? "md:w-3/12" : "md:w-1/3"
            } bg-white p-4 rounded-xl shadow-md flex flex-col`}          >
            <div className="mb-3">
              <h5 className="text-xl md:text-2xl font-bold text-pink-600 mb-1">
                {title}
              </h5>
              <p className="text-sm text-gray-500">
                {description}
              </p>
            </div>
            
            <hr className="border-gray-200 mb-3" />
            
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Analysis Result
            </h2>
            
            {result ? (
              <div className="text-base md:text-lg text-gray-700 mb-3 animate-fadeIn">
                Your result is
                <span className="font-bold text-pink-600 ml-1">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: result,
                    }}
                  ></div>
                </span>
              </div>
            ) : (
              <div className="text-base md:text-lg text-gray-500 mb-3">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-pink-600"></div>
                  <span>Analyzing...</span>
                </div>
              </div>
            )}
            
            {colorPalette && (
              <div className="flex-1 mt-2">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  Color Palette
                </h3>
                <div className="animate-fadeIn">
                  {colorPalette}
                </div>
              </div>
            )}
            
            {actionButtons && (
              <div className="mt-auto pt-3 flex flex-col gap-2">
                {actionButtons}
              </div>
            )}
          </div>
        </div>
        
        {/* Custom CSS */}
        <style jsx global>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          .animate-slideIn {
            animation: slideIn 0.3s ease-out;
          }
          
          .animate-fadeIn {
            animation: fadeIn 0.5s ease-out;
          }
        `}</style>
      </div>
    );
  },
  // Custom comparator function để tránh re-renders không cần thiết
  (prevProps, nextProps) => {
    // Chỉ re-render khi các prop quan trọng thay đổi
    return (
      prevProps.result === nextProps.result &&
      prevProps.error === nextProps.error &&
      prevProps.progress === nextProps.progress &&
      prevProps.statusMessage === nextProps.statusMessage
    );
  }
);

export default AnalysisLayout;