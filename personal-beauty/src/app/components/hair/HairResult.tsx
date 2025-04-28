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
        <div className="text-lg md:text-xl text-gray-700 mb-4">
          Your result is
          <span className="font-bold text-pink-600">
            <div>{makeupSuggestion}</div>
          </span>
          .
        </div>
      ) : (
        <p className="text-lg md:text-xl text-gray-500 animate-pulse mb-4">
          Waiting for analysis...
        </p>
      )}
    </div>
  );
};

export default React.memo(HairResult);