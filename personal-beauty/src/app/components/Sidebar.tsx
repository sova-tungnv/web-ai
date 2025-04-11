// src/components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const features: { name: string; path: string }[] = [
    { name: "Personal Color", path: "/personal-color" },
    { name: "Personal Body Type", path: "/personal-body-type" },
    { name: "Personal Makeup", path: "/personal-makeup" },
    { name: "Hair Color", path: "/hair-color" },
    { name: "Cosmetic Surgery", path: "/cosmetic-surgery" },
  ];

  return (
    <div className="w-72 bg-pink-200 p-6 shadow-lg flex flex-col gap-6">
      <Link href="/">
        <h1 className="text-3xl font-bold text-pink-600 mb-8 cursor-pointer hover:text-pink-800 transition duration-300">
          Personal Beauty
        </h1>
      </Link>
      <nav>
        <ul className="space-y-6">
          {features.map((feature) => (
            <li key={feature.name}>
              <div
                className={`menu-item text-center font-semibold py-6 px-8 rounded-xl transition duration-300 text-white text-2xl ${
                  pathname === feature.path ? "bg-pink-600" : "bg-pink-400"
                } hover:bg-pink-600 hover:scale-110 hover:border-4 hover:border-pink-800`}
                data-path={feature.path}
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