// src/components/AnalysisLayout.tsx
"use client";

interface AnalysisLayoutProps {
    title: string;
    description: string;
    videoRef: React.RefObject<HTMLVideoElement>;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    result: string | null;
}

export default function AnalysisLayout({
    title,
    description,
    videoRef,
    canvasRef,
    result,
}: AnalysisLayoutProps) {
    return (
        <div className="flex flex-col gap-8 h-[calc(100vh-2rem)] overflow-hidden">
            {/* Bố cục chia đôi */}
            <div className="flex flex-col md:flex-row gap-8 flex-1 overflow-hidden">
                {/* Bên trái: Video */}
                <div className="md:w-2/3 bg-white p-6 rounded-xl shadow-md flex flex-col">
                    <div className="relative w-[480px] h-[853px] mx-auto">
                        <video ref={videoRef} className="hidden" />
                        <canvas
                            ref={canvasRef}
                            width={1080}
                            height={1920}
                            className="w-full h-full object-cover rounded-2xl shadow-lg border-4 border-gray-200"
                        />
                    </div>
                </div>

                {/* Bên phải: Kết quả */}
                <div className="md:w-1/3 bg-white p-6 rounded-xl shadow-md flex flex-col">
                    {/* Tiêu đề và Mô tả */}
                    <div className="justify-between items-center">
                        <div>
                            <h5 className="text-3xl font-bold text-pink-600">{title}</h5>
                            <p className="text-1xl text-gray-500">{description}</p>
                        </div>
                    </div>
                    <hr className="text-gray-300" />
                    <br />
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4">Analysis Result</h2>
                    {result ? (
                        <p className="text-2xl text-gray-700">
                            Result: Your skin tone is <span className="font-bold">{result}</span>.
                        </p>
                    ) : (
                        <p className="text-2xl text-gray-500">Waiting for analysis...</p>
                    )}
                </div>
            </div>
        </div>
    );
}