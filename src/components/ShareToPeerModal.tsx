import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { Check, Copy, Send, X } from 'lucide-react';
import { ModalShell } from './MotionPrimitives';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, handleSnapshotError, OperationType } from '../lib/firebase';
import { clampString, getConversationId } from '../lib/utils';
import type { StudentProfile } from '../types';

interface ShareResourcePayload {
  type: 'material' | 'pastQuestion';
  id: string;
  title: string;
  courseCode: string;
}

interface ShareToPeerModalProps {
  resource: ShareResourcePayload | null;
  onClose: () => void;
  onShared?: (peerName: string) => void;
}

export function ShareToPeerModal({ resource, onClose, onShared }: ShareToPeerModalProps) {
  const { user, profile } = useAuth();
  const [peers, setPeers] = useState<StudentProfile[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Record<string, boolean>>({});
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!resource || !user) return;
    setShareError(null);
    const q = query(collection(db, 'profiles'), where('isPublic', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as StudentProfile)
          .filter((p) => p.uid !== user.uid);
        setPeers(list);
      },
      (err) => {
        handleSnapshotError(err, OperationType.LIST, 'profiles');
      }
    );
    return () => unsub();
  }, [resource, user]);

  const isOpen = Boolean(resource && user);

  const filteredPeers = peers.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.displayName.toLowerCase().includes(q) ||
      p.program.toLowerCase().includes(q) ||
      p.courses.some((c) => c.toLowerCase().includes(q))
    );
  });

  // Sort peers taking the exact same course first
  const sortedPeers = resource
    ? [...filteredPeers].sort((a, b) => {
        const aSame = a.courses.includes(resource.courseCode) ? 1 : 0;
        const bSame = b.courses.includes(resource.courseCode) ? 1 : 0;
        return bSame - aSame;
      })
    : [];

  const handleCopyShareText = async () => {
    if (!resource) return;
    const shareSummary = `${resource.courseCode} · ${resource.title}\nShared via Scholaryx (${window.location.origin}/?resource=${resource.type}:${resource.id})`;
    await navigator.clipboard.writeText(shareSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToPeer = async (peer: StudentProfile) => {
    if (!resource || !user || peer.uid === user.uid || sendingTo) return;
    setSendingTo(peer.uid);
    setShareError(null);
    const convId = getConversationId(user.uid, peer.uid);
    const sortedParticipants = [user.uid, peer.uid].sort();
    const myName = clampString(profile?.displayName || user.displayName || 'Student', 120) || 'Student';
    const peerName = clampString(peer.displayName, 120) || 'Student';
    const sortedNames = sortedParticipants[0] === user.uid ? [myName, peerName] : [peerName, myName];

    const messageText = clampString(
      note.trim() || `Shared ${resource.courseCode} ${resource.type === 'pastQuestion' ? 'past paper' : 'study material'}: ${resource.title}`,
      4000
    ) || 'Shared study resource';

    let currentOp: (typeof OperationType)[keyof typeof OperationType] = OperationType.GET;
    let currentPath = `conversations/${convId}`;

    try {
      const convRef = doc(db, 'conversations', convId);
      const convSnap = await getDoc(convRef);
      let participantIds = sortedParticipants;

      if (!convSnap.exists()) {
        currentOp = OperationType.CREATE;
        await setDoc(convRef, {
          participantIds: sortedParticipants,
          participantNames: sortedNames,
          lastMessage: clampString(messageText, 300),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingData = convSnap.data();
        if (Array.isArray(existingData?.participantIds) && existingData.participantIds.length === 2) {
          participantIds = existingData.participantIds as string[];
        }
        currentOp = OperationType.UPDATE;
        await updateDoc(convRef, {
          lastMessage: clampString(messageText, 300),
          updatedAt: serverTimestamp(),
        });
      }

      currentOp = OperationType.CREATE;
      currentPath = `conversations/${convId}/messages`;
      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        senderId: user.uid,
        senderName: myName,
        participantIds,
        text: messageText,
        sharedResourceType: resource.type,
        sharedResourceId: resource.id,
        sharedResourceTitle: clampString(resource.title, 180) || 'Shared Resource',
        sharedResourceCourse: clampString(resource.courseCode, 24),
        createdAt: serverTimestamp(),
      });

      setSentIds((prev) => ({ ...prev, [peer.uid]: true }));
      onShared?.(peer.displayName);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Unable to send resource to this peer.');
      handleFirestoreError(err, currentOp, currentPath);
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <ModalShell open={isOpen} onClose={onClose} maxWidthClass="max-w-lg">
      {resource && (
        <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Share Study Resource
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {resource.courseCode} · {resource.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close share dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950">
            <span className="truncate text-xs text-slate-600 dark:text-slate-300">
              Copy direct course resource link
            </span>
            <button
              type="button"
              onClick={handleCopyShareText}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Optional message to classmate
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Helpful notes for Friday's midterm"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {shareError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {shareError}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Send directly to a peer
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name or course..."
                className="w-48 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="mt-2 max-h-56 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {sortedPeers.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  No other student profiles found yet. Copy the link above to share externally.
                </p>
              ) : (
                sortedPeers.map((peer) => {
                  const sameCourse = peer.courses.includes(resource.courseCode);
                  const alreadySent = sentIds[peer.uid];
                  return (
                    <div key={peer.uid} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar
                          name={peer.displayName}
                          photoURL={peer.photoURL}
                          size="sm"
                          variant="slate"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {peer.displayName}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {peer.program}
                            {sameCourse ? ` · Taking ${resource.courseCode}` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={sendingTo === peer.uid || alreadySent}
                        onClick={() => handleSendToPeer(peer)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
                      >
                        {alreadySent ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Sent
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            {sendingTo === peer.uid ? 'Sending...' : 'Send'}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        </div>
      )}
    </ModalShell>
  );
}
