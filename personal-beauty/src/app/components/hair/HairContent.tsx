/* eslint-disable react/display-name */
// src/app/components/AnalysisLayout.tsx

"use client";

import React, { memo } from "react";
import { RefObject } from "react";

interface HairContentProps {
    videoRef: RefObject<HTMLVideoElement | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
}

const HairContent = memo(
  ({
    videoRef,
    canvasRef,
  }: HairContentProps) => {

    return (
        <div
            className={`md:w-7/12 px-6 md:px-2 rounded-xl flex flex-col items-center`}
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
    );
  },
);

export default HairContent;