import { useCallback, useEffect, useState } from 'react';

type BookmarkKind = 'materials' | 'pastQuestions';

interface BookmarkState {
  materials: string[];
  pastQuestions: string[];
}

const EMPTY_BOOKMARKS: BookmarkState = {
  materials: [],
  pastQuestions: [],
};

function getStorageKey(uid?: string | null): string {
  return `scholaryx_bookmarks_${uid || 'guest'}`;
}

function readStoredBookmarks(uid?: string | null): BookmarkState {
  if (typeof window === 'undefined') return EMPTY_BOOKMARKS;
  try {
    const raw = window.localStorage.getItem(getStorageKey(uid));
    if (!raw) return EMPTY_BOOKMARKS;
    const parsed = JSON.parse(raw) as Partial<BookmarkState>;
    return {
      materials: Array.isArray(parsed.materials)
        ? parsed.materials.filter((id): id is string => typeof id === 'string')
        : [],
      pastQuestions: Array.isArray(parsed.pastQuestions)
        ? parsed.pastQuestions.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return EMPTY_BOOKMARKS;
  }
}

export function useBookmarks(uid?: string | null) {
  const [bookmarks, setBookmarks] = useState<BookmarkState>(() => readStoredBookmarks(uid));

  useEffect(() => {
    setBookmarks(readStoredBookmarks(uid));
  }, [uid]);

  const toggleBookmark = useCallback(
    (kind: BookmarkKind, resourceId: string) => {
      setBookmarks((prev) => {
        const list = prev[kind];
        const exists = list.includes(resourceId);
        const nextList = exists ? list.filter((id) => id !== resourceId) : [resourceId, ...list].slice(0, 200);
        const nextState: BookmarkState = {
          ...prev,
          [kind]: nextList,
        };
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(getStorageKey(uid), JSON.stringify(nextState));
          } catch {
            // Ignore quota errors on private browsing
          }
        }
        return nextState;
      });
    },
    [uid]
  );

  const isBookmarked = useCallback(
    (kind: BookmarkKind, resourceId: string) => bookmarks[kind].includes(resourceId),
    [bookmarks]
  );

  return {
    bookmarkedMaterialIds: bookmarks.materials,
    bookmarkedQuestionIds: bookmarks.pastQuestions,
    toggleBookmark,
    isBookmarked,
  };
}
