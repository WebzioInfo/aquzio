import React from 'react';
import { AlertCircle, CheckCircle, Sparkles } from 'lucide-react';

interface BatchNumberSuggestionProps {
  value: string;
  badgeLetters?: string;
  onApplyPrefix?: (newBatchValue: string) => void;
  className?: string;
}

export const BatchNumberSuggestion: React.FC<BatchNumberSuggestionProps> = ({
  value,
  badgeLetters,
  onApplyPrefix,
  className = ''
}) => {
  if (!badgeLetters || !badgeLetters.trim()) return null;

  const targetPrefix = badgeLetters.trim().toUpperCase();
  const currentVal = (value || '').trim().toUpperCase();
  const isMatch = currentVal.startsWith(targetPrefix);

  if (isMatch) {
    return (
      <div className={`mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium ${className}`}>
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Valid: Starts with company badge prefix (<strong>{targetPrefix}</strong>)</span>
      </div>
    );
  }

  if (!currentVal) {
    return (
      <div className={`mt-1.5 flex items-center justify-between gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 ${className}`}>
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <span>
            Suggestion: Use <strong>{targetPrefix}</strong> as the starting prefix
          </span>
        </div>
        {onApplyPrefix && (
          <button
            type="button"
            onClick={() => onApplyPrefix(`${targetPrefix}-`)}
            className="text-teal-700 hover:text-teal-800 underline font-bold cursor-pointer text-[10px]"
          >
            Apply {targetPrefix}
          </button>
        )}
      </div>
    );
  }

  // Value is typed but does not start with badgeLetters
  return (
    <div className={`mt-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1 ${className}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span className="truncate">
          Warning: Batch code should start with <strong>{targetPrefix}</strong>
        </span>
      </div>
      {onApplyPrefix && (
        <button
          type="button"
          onClick={() => {
            const separator = value.startsWith('-') ? '' : '-';
            onApplyPrefix(`${targetPrefix}${separator}${value}`);
          }}
          className="text-amber-900 hover:underline font-bold text-[10px] shrink-0 uppercase tracking-wider bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded cursor-pointer transition"
        >
          Prefix {targetPrefix}
        </button>
      )}
    </div>
  );
};
