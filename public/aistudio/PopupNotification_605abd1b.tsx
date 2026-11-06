import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';

export type NotificationVariant = 'success' | 'warning' | 'error';

export interface AppNotificationPayload {
  id: number;
  title: string;
  message: string;
  variant: NotificationVariant;
}

interface PopupNotificationProps {
  notification: AppNotificationPayload | null;
  onClose: () => void;
}

export const PopupNotification: React.FC<PopupNotificationProps> = ({
  notification,
  onClose,
}) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Automatically dismiss after 5 seconds (5,000 ms)
  useEffect(() => {
    if (!notification) return;
    const timerId = window.setTimeout(() => {
      onCloseRef.current();
    }, 5000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [notification?.id]);

  if (!notification) return null;

  const isError = notification.variant === 'error';
  const isWarning = notification.variant === 'warning';

  const cardBorderClass = isError
    ? 'border-red-200'
    : isWarning
    ? 'border-amber-200'
    : 'border-emerald-200';

  const iconBoxClass = isError
    ? 'bg-red-50 text-red-700 border-red-200/80'
    : isWarning
    ? 'bg-amber-50 text-amber-700 border-amber-200/80'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200/80';

  const progressBarClass = isError
    ? 'bg-red-600'
    : isWarning
    ? 'bg-amber-500'
    : 'bg-emerald-600';

  return (
    <div
      className="no-print fixed inset-x-0 top-16 sm:top-20 z-[80] flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        key={notification.id}
        className={`pointer-events-auto animate-popup-enter w-full max-w-lg bg-white border ${cardBorderClass} rounded-xl shadow-xl shadow-slate-900/12 overflow-hidden`}
      >
        <div className="p-4 flex items-start gap-3.5">
          <div
            className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 ${iconBoxClass}`}
          >
            {isError ? (
              <XCircle className="w-4.5 h-4.5" />
            ) : isWarning ? (
              <AlertTriangle className="w-4.5 h-4.5" />
            ) : (
              <CheckCircle2 className="w-4.5 h-4.5" />
            )}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="text-xs sm:text-sm font-semibold text-slate-900">
              {notification.title}
            </div>
            <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
              {notification.message}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center shrink-0 transition-colors"
            aria-label="ปิดการแจ้งเตือน"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5-second auto-dismiss visual countdown bar */}
        <div className="h-1 w-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full w-full animate-popup-progress ${progressBarClass}`}
          />
        </div>
      </div>
    </div>
  );
};
