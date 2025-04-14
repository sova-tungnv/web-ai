// src/components/Sidebar.tsx
"use client";

import { ViewType, VIEW_LIST, VIEWS } from "../constants/views";

interface SidebarProps {
  currentView: ViewType;
}

export default function Sidebar({ currentView }: SidebarProps) {
  return (
    <div className="w-72 bg-pink-200 p-6 shadow-lg flex flex-col gap-6">
      <div className="text-3xl font-bold text-pink-600 mb-8 cursor-pointer hover:text-pink-800 transition duration-300" data-view={VIEWS.HOME}>
        Personal Beauty
      </div>
      <nav>
        <ul className="space-y-6">
          {VIEW_LIST.map((feature) => (
            <li key={feature.name}>
              <div
                className={`menu-item text-center font-semibold py-6 px-8 rounded-xl transition duration-300 text-white text-2xl ${
                  currentView === feature.view ? "bg-pink-600" : "bg-pink-400"
                } hover:bg-pink-600 hover:scale-110 hover:border-4 hover:border-pink-800`}
                data-view={feature.view}
              >
                {feature.name}
              </div>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}