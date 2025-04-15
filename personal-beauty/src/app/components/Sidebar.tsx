// src/context/Sidebar.tsx

"use client";

import { useEffect, useRef } from "react";
import { ViewType, VIEW_LIST, VIEWS } from "../constants/views";
import { useHandControl } from "../context/HandControlContext";

interface SidebarProps {
  currentView: ViewType;
  onMenuSelect: (view: ViewType) => void;
}

export default function Sidebar({ currentView, onMenuSelect }: SidebarProps) {
  const { registerElement, unregisterElement } = useHandControl();
  const menuRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const logoRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (logoRef.current) {
      registerElement(logoRef.current);
      //console.log("[Sidebar] Registered logo: Personal Beauty");
    }

    menuRefs.current.forEach((menuItem, index) => {
      if (menuItem) {
        registerElement(menuItem);
        //console.log(`[Sidebar] Registered menu item: ${VIEW_LIST[index].name}`);
      }
    });

    return () => {
      if (logoRef.current) {
        unregisterElement(logoRef.current);
        //console.log("[Sidebar] Unregistered logo: Personal Beauty");
      }
      menuRefs.current.forEach((menuItem, index) => {
        if (menuItem) {
          unregisterElement(menuItem);
          //console.log(`[Sidebar] Unregistered menu item: ${VIEW_LIST[index].name}`);
        }
      });
    };
  }, [registerElement, unregisterElement, currentView]);

  return (
    <div className="w-64 bg-pink-200 p-6 shadow-lg flex flex-col gap-4 relative z-10">
      <button
        ref={logoRef}
        className="text-3xl font-bold text-pink-600 mb-6 cursor-pointer hover:text-pink-800 transition duration-300 focus:outline-none focus:ring-2 focus:ring-pink-600"
        data-view={VIEWS.HOME}
        onClick={() => onMenuSelect(VIEWS.HOME)}
      >
        Personal Beauty
      </button>

      <nav role="navigation" aria-label="Main menu">
        <ul className="space-y-4">
          {VIEW_LIST.map((feature, index) => (
            <li key={feature.name}>
              <button
                ref={(el) => (menuRefs.current[index] = el)}
                className={`menu-item w-full focus:outline-none focus:ring-2 focus:ring-pink-600 ${
                  currentView === feature.view ? "menu-item-active" : ""
                }`}
                data-view={feature.view}
                role="menuitem"
                aria-current={currentView === feature.view ? "page" : undefined}
                onClick={() => onMenuSelect(feature.view)}
              >
                {feature.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}