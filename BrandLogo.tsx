import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const DIMENSIONS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-9 w-9 rounded-xl',
  lg: 'h-11 w-11 rounded-xl',
};

export function ScholaryxLogo({ size = 'md', className = '' }: BrandLogoProps) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-sm ring-1 ring-inset ring-white/25 ${DIMENSIONS[size]} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-[68%] w-[68%]"
      >
        <path
          d="M7 11.5C7 10.1193 8.11929 9 9.5 9H15.5C16.8807 9 18 10.1193 18 11.5V26.5C16.7 25.4 14.9 24.8 13 24.8H9.5C8.11929 24.8 7 23.6807 7 22.3V11.5Z"
          fill="white"
          fillOpacity="0.92"
        />
        <path
          d="M29 11.5C29 10.1193 27.8807 9 26.5 9H20.5C19.1193 9 18 10.1193 18 11.5V26.5C19.3 25.4 21.1 24.8 23 24.8H26.5C27.8807 24.8 29 23.6807 29 22.3V11.5Z"
          fill="white"
          fillOpacity="0.72"
        />
        <path
          d="M18 4.2L19.65 7.55L23 9.2L19.65 10.85L18 14.2L16.35 10.85L13 9.2L16.35 7.55L18 4.2Z"
          fill="#FDE047"
        />
      </svg>
    </div>
  );
}
