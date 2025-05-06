import React from 'react';

interface AnalysisResultProps {
  title: string;
  description: string;
  makeupSuggestion?: string | null;
}

const HairResult: React.FC<AnalysisResultProps> = ({
  title,
  description,
  makeupSuggestion,
}) => {
  return (
    <div className="md:w-3/12 bg-white p-4 md:p-6 rounded-xl shadow-md flex flex-col max-h-[calc(100vh-64px)] overflow-hidden">
      <div className="mb-4">
        <h5 className="text-2xl md:text-3xl font-bold text-pink-600">
          {title}
        </h5>
        <p className="text-sm md:text-base text-gray-500 mt-2">
          {description}
        </p>
      </div>
      <hr className="border-gray-200 mb-4" />
      <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4">
        Analysis Result
      </h2>
      {makeupSuggestion ? (
        <div className={`text-base md:text-lg text-gray-700 mb-3 animate-fadeIn p-3 rounded-lg ${
              makeupSuggestion.toLowerCase().includes('warm')
                ? 'bg-orange-100'
                : makeupSuggestion.toLowerCase().includes('cool')
                ? 'bg-blue-100'
                : 'bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-2">
              {makeupSuggestion.toLowerCase().includes('warm') && (
                <svg
                  className="w-5 h-5 text-orange-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 2a8 8 0 0 0-8 8c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm0 2a6 6 0 0 1 6 6c0 1.66-.68 3.15-1.76 4.24l-1.41-1.41C15.55 14.1 16 13.1 16 12a4 4 0 0 0-4-4c-1.1 0-2.1.45-2.83 1.17l-1.41-1.41C8.85 6.68 10.34 6 12 6z" />
                </svg>
              )}
              {makeupSuggestion.toLowerCase().includes('cool') && (
                <svg
                  className="w-5 h-5 text-blue-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 2a8 8 0 0 0-8 8c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-2 6l2-2 2 2 2-2 2 2-2 2 2 2-2 2-2-2-2 2-2-2 2-2z" />
                </svg>
              )}
              <span>Your result is</span>
              <span className="font-bold text-pink-600 ml-1">
                {makeupSuggestion}
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
    </div>
  );
};

export default React.memo(HairResult);