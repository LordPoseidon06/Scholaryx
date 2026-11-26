import React, { useEffect, useState } from 'react';
import { isSafeAvatarUrl } from '../lib/avatar';
import { getInitials } from '../lib/utils';

type AvatarSize = 'sm' | 'md' | 'lg';
type AvatarVariant = 'slate' | 'blue';

interface UserAvatarProps {
  name: string;
  photoURL?: string | null;
  size?: AvatarSize;
  variant?: AvatarVariant;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-16 w-16 text-lg font-bold',
};

const VARIANT_CLASSES: Record<AvatarVariant, string> = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  blue: 'bg-blue-700 text-white',
};

export function UserAvatar({
  name,
  photoURL,
  size = 'md',
  variant = 'slate',
  className = '',
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [photoURL]);

  const validUrl = !imgFailed && isSafeAvatarUrl(photoURL) ? photoURL!.trim() : null;

  if (validUrl) {
    return (
      <img
        src={validUrl}
        alt={`${name || 'Student'} profile picture`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700 ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {getInitials(name || 'ST')}
    </div>
  );
}
