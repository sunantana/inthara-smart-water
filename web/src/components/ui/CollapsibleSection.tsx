import { useState, type ReactNode } from 'react';

export interface CollapsibleSectionProps {
  title?: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export default function CollapsibleSection({
  title = 'ข้อมูลเพิ่มเติม (คลิกเพื่อแสดง/ซ่อน)',
  badge,
  defaultOpen = false,
  children,
  className = '',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-xl border border-slate-200/90 bg-slate-50/70 transition dark:border-slate-700/80 dark:bg-slate-800/40 ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex min-h-[44px] w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:text-slate-900 focus:outline-none dark:text-slate-300 dark:hover:text-white"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform duration-200 dark:text-slate-500 ${
              isOpen ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>{title}</span>
          {badge !== undefined && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              {badge}
            </span>
          )}
        </span>
        <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
          {isOpen ? 'ซ่อน' : 'แสดง'}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200/80 p-3.5 pt-3 space-y-3 dark:border-slate-700/80">
          {children}
        </div>
      )}
    </div>
  );
}
