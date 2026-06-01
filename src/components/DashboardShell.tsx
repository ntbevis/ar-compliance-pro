'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import BrandLogo from '@/components/BrandLogo';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-black text-white overflow-x-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:shrink-0 md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <Sidebar />
      </div>

      {/* Mobile slide-over overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 bottom-0 w-[min(100vw,18rem)] flex flex-col shadow-2xl">
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 w-full overflow-x-hidden overflow-y-auto">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 md:hidden bg-black border-b border-gray-800 px-3 py-3 flex items-center justify-between gap-2 shrink-0">
          <BrandLogo
            size="xs"
            showWordmark
            wordmarkLayout="split"
            wordmarkClassName="text-white text-[11px] leading-none"
            className="min-w-0 flex-1"
          />
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="text-gray-400 hover:text-white p-2 rounded-lg transition-colors shrink-0"
            aria-label="Open navigation"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        <div className="min-w-0 max-w-full">{children}</div>
      </main>
    </div>
  );
}
