import { useEffect } from 'react';

export interface ToastProps {
  message: string | null;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({
  message,
  type = 'success',
  onClose,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const bgStyles = {
    success: 'bg-emerald-600 text-white shadow-emerald-500/20',
    error: 'bg-rose-600 text-white shadow-rose-500/20',
    info: 'bg-sky-600 text-white shadow-sky-500/20',
  }[type];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-5 right-5 z-[100] flex max-w-md items-center gap-3 transition-all duration-200"
    >
      <div className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${bgStyles}`}>
        {type === 'success' && (
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {type === 'error' && (
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {type === 'info' && (
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        <span className="text-sm font-medium">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg p-1 text-white/80 hover:bg-black/10 hover:text-white"
          title="ปิดการแจ้งเตือน"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
