"use client"
// src/components/MenuButton.tsx
interface MenuButtonProps {
    label: string;
}

export default function MenuButton({ label }: MenuButtonProps) {
    return (
        <div className="bg-pink-400 text-white font-semibold py-4 px-6 rounded-lg shadow-md hover:bg-pink-500 transition duration-300 text-center">
            {label}
        </div>
    );
}