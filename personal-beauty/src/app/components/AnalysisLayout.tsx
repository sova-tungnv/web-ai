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
  statusMessage?: string;
  progress?: number;
}

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
    statusMessage = "Đang khởi tạo...",
    progress = 0,
  }: AnalysisLayoutProps) => {
    const [showError, setShowError] = useState(false);

    useEffect(() => {
      if (error) {
        setShowError(true);
        const timer = setTimeout(() => {
          setShowError(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }, [error]);

    // Tùy chỉnh màu và biểu tượng theo trạng thái
    const progressColor = useMemo(() => {
      if (progress === 0) return "bg-red-500"; // Không phát hiện khuôn mặt
      if (progress <= 20) return "bg-gray-500"; // Chưa đủ khung hình
      if (progress <= 60) return "bg-yellow-500"; // Đang phân tích
      return "bg-green-500"; // Hoàn tất
    }, [progress]);

    const statusIcon = useMemo(() => {
      if (progress === 0) return (
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
      if (progress <= 60) return (
        <svg className="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12a8 8 0 0116 0 8 8 0 01-16 0z" />
        </svg>
      );
      return (
        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
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

        {/* Status Message and Progress - Always Visible */}
        <div className="bg-white p-3 rounded-lg shadow-sm mb-2 h-16 flex items-center">
          <div className="flex items-center w-full">
            {statusIcon}
            <div className="flex-1">
              <p className="text-gray-700 text-sm mb-2">{statusMessage}</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full transition-all duration-300 ${progressColor}`} 
                  style={{ width: `${progress}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1 overflow-hidden">
          {/* Video Container */}
          <div
            className={`${selectionButtons ? "md:w-7/12" : "md:w-2/3"} px-6 md:px-2 rounded-xl flex flex-col items-center`}
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
              {!result && statusMessage.includes("Không phát hiện khuôn mặt") && (
                <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center animate-pulse">
                  <p className="text-white text-lg font-semibold">{statusMessage}</p>
                </div>
              )}
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${result ? "stable" : ""}`}
              />
            </div>
          </div>
          {selectionButtons && (<>{selectionButtons}</>)}
          {/* Results Container */}
          <div
            className={`${selectionButtons ? "md:w-3/12" : "md:w-1/3"} bg-white p-4 rounded-xl shadow-md flex flex-col`}
          >
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
              <div className={`text-base md:text-lg text-gray-700 mb-3 animate-fadeIn p-3 rounded-lg ${
                result === "Warm" ? "bg-orange-100" : 
                result === "Cool" ? "bg-blue-100" : 
                "bg-gray-100"
              }`}>
                <div className="flex items-center gap-2">
                  {result === "Warm" && <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 2a8 8 0 0 0-8 8c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm0 2a6 6 0 0 1 6 6c0 1.66-.68 3.15-1.76 4.24l-1.41-1.41C15.55 14.1 16 13.1 16 12a4 4 0 0 0-4-4c-1.1 0-2.1.45-2.83 1.17l-1.41-1.41C8.85 6.68 10.34 6 12 6z"/></svg>}
                  {result === "Cool" && <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 2a8 8 0 0 0-8 8c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-2 6l2-2 2 2 2-2 2 2-2 2 2 2-2 2-2-2-2 2-2-2 2-2z"/></svg>}
                  {result === "Neutral" && <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 2a8 8 0 0 0-8 8c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-4 4h8v2H8zm0 4h8v2H8z"/></svg>}
                  <span>Your result is</span>
                  <span className="font-bold text-pink-600 ml-1">
                    <div dangerouslySetInnerHTML={{ __html: result }}></div>
                  </span>
                </div>
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
        
        <style jsx global>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes pulse {
            0% { opacity: 0.3; }
            50% { opacity: 0.5; }
            100% { opacity: 0.3; }
          }
          
          .animate-slideIn {
            animation: slideIn 0.3s ease-out;
          }
          
          .animate-fadeIn {
            animation: fadeIn 0.5s ease-out;
          }
          
          .animate-pulse {
            animation: pulse 2s ease-in-out infinite;
          }
          
          canvas {
            transition: opacity 0.3s ease;
            opacity: 0;
          }
          
          canvas.stable {
            opacity: 1;
          }
        `}</style>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.result === nextProps.result &&
      prevProps.error === nextProps.error &&
      prevProps.progress === nextProps.progress &&
      prevProps.statusMessage === nextProps.statusMessage
    );
  }
);

export default AnalysisLayout;