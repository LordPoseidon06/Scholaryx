import React from 'react';
import { GraduationCap, HeartHandshake } from 'lucide-react';

interface LecturerAcknowledgementProps {
  variant?: 'banner' | 'compact';
}

export function LecturerAcknowledgement({ variant = 'banner' }: LecturerAcknowledgementProps) {
  if (variant === 'compact') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="leading-relaxed">
          <span className="font-semibold">Lecturer Acknowledgement:</span> The lecture slides and study materials shared here were not created by the Scholaryx developer. This platform simply helps students access, organize, and revise them more easily — all credit and heartfelt thanks belong to the lecturers who prepared and provided them.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Lecturer Acknowledgement"
      className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 p-4 sm:p-5 shadow-2xs dark:border-amber-900/50 dark:from-amber-950/35 dark:via-slate-900 dark:to-orange-950/25"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
            Acknowledgement &amp; Thanks to Our Lecturers
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            Please note that the developer of this platform did <span className="font-semibold">not</span> create these lecture slides, notes, or study materials. Scholaryx is built solely to help students access, read, and revise course resources more easily. All thanks, credit, and appreciation go to every lecturer and teaching team who created and kindly provided these materials for student learning.
          </p>
        </div>
      </div>
    </section>
  );
}
