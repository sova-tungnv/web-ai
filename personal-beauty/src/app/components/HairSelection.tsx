/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { RefObject } from 'react';

interface HairSelectionProps {
  handleScrollUp: () => void;
  buttonRefs: RefObject<(HTMLButtonElement | null)[]>;
  scrollContainerRef: RefObject<null>;
  hairColorList: any[];
  filterHair: any;
  onChangeSelectHair: (color: any) => void;
  handleScrollDown: () => void;
}

const HairSelection: React.FC<HairSelectionProps> = ({
  handleScrollUp,
  buttonRefs,
  scrollContainerRef,
  hairColorList,
  filterHair,
  onChangeSelectHair,
  handleScrollDown
}) => {
  return (
    <div className="md:w-2/12 bg-white p-2 md:p-2 rounded-xl shadow-md flex flex-col max-h-[calc(100vh-128px)] overflow-hidden">
    <button
      onClick={handleScrollUp}
      ref={(el) => {
        buttonRefs.current[0] = el;
      }}
      className="hover:bg-gray-300 active:bg-gray-200 text-[50px] cursor-pointer text-[#db2777] flex items-center min-h-[124px] justify-center gap-4 border-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out"
    >↑</button>
    <div
      ref={scrollContainerRef}
      className="hide-scrollbar flex flex-col my-1 gap-2 flex-1 max-w-full overflow-y-auto flex-nowrap mb-1 pb-1"
    >
      {hairColorList.map((color: any, index: any) => (
      <button
        key={color.name + (filterHair === color.key ? 1 : 0)}
        className={`flex area-button cursor-pointer duration-300 transform text-gray-800 hoverable hover:bg-gray-300 px-[20px] justify-start min-h-[120px] items-center gap-4 rounded-lg shadow-sm hover:shadow-md transition-shadow ease-in-out ${filterHair === color.key
          ? "bg-pink-600 text-white border-pink-300 hover:bg-pink-600"
          : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        ref={(el) => {
          buttonRefs.current[index + 2] = el;
        }}
        onClick={() => onChangeSelectHair(color)}
      >
        <div
          className="w-9 h-9 rounded-full box-border"
          style={{
            backgroundColor: `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`,
            outline: filterHair === color.key ? '2px solid white' : 'none',
            outlineOffset: filterHair === color.key ? '1px' : '0',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        ></div>
        <span className={`font-medium ${filterHair === color.key ? "text-white" : "text-gray-700"}`}>{color.name}</span>
      </button>
      ))}
    </div>
    <button
      onClick={handleScrollDown}
      ref={(el) => {
        buttonRefs.current[1] = el;
      }}
      className="text-[50px] hover:bg-gray-300 active:bg-gray-200 cursor-pointer text-[#db2777] flex items-center min-h-[124px] justify-center gap-4 border-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out"
    >↓</button>
  </div>
  );
  
};

export default React.memo(HairSelection,
(prevProps, nextProps) => {
  return (
    prevProps.filterHair === nextProps.filterHair
  );
});