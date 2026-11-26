import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Info,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT_EXPO, SegmentedTabs } from '../components/MotionPrimitives';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, formatTimestamp, getConversationId, getTimestampMillis } from '../lib/utils';
import type { ChatMessage, Conversation, NavSection, PastQuestion, StudentProfile, StudyMaterial } from '../types';

interface PeersChatPageProps {
  activePeerUid?: string | null;
  onSelectPeerUid?: (peerUid: string | null) => void;
  onOpenResource?: (type: 'material' | 'pastQuestion', resourceId: string) => void;
  onNavigate: (section: NavSection) => void;
}

const QUICK_STARTERS = [
  'Hey! Are you reviewing for the upcoming exam?',
  'Want to compare lecture notes for this week?',
  'Do you have any past paper solutions for our course?',
];

function formatBubbleClock(ts: unknown): string {
  const ms = getTimestampMillis(ts);
  if (!ms) return 'Now';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDayHeading(ts: unknown): string {
  const ms = getTimestampMillis(ts);
  if (!ms) return 'Today';
  const d = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMsgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfMsgDay) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PeersChatPage({
  activePeerUid = null,
  onSelectPeerUid,
  onOpenResource,
  onNavigate,
}: PeersChatPageProps) {
  const { user, profile } = useAuth();
  const [peers, setPeers] = useState<StudentProfile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [fallbackPeer, setFallbackPeer] = useState<StudentProfile | null>(null);
  const [localPeerUid, setLocalPeerUid] = useState<string | null>(activePeerUid);
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'peers'>('chats');
  const [showPeerInfo, setShowPeerInfo] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [onlySameCourses, setOnlySameCourses] = useState(false);

  // Resource attachment picker inside DM
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [attachSearch, setAttachSearch] = useState('');
  const [attachMaterials, setAttachMaterials] = useState<StudyMaterial[]>([]);
  const [attachQuestions, setAttachQuestions] = useState<PastQuestion[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep local mirror synced when parent drives activePeerUid (e.g. browser Back/Forward)
  useEffect(() => {
    setLocalPeerUid(activePeerUid ?? null);
    setChatError(null);
    setShowPeerInfo(false);
    setShowAttachPicker(false);
  }, [activePeerUid]);

  const effectivePeerUid = onSelectPeerUid ? activePeerUid : localPeerUid;

  const setActivePeer = (peer: StudentProfile | null) => {
    setChatError(null);
    setShowPeerInfo(false);
    setShowAttachPicker(false);
    const nextUid = peer?.uid ?? null;
    if (onSelectPeerUid) {
      onSelectPeerUid(nextUid);
    } else {
      setLocalPeerUid(nextUid);
    }
    if (peer) {
      setFallbackPeer(peer);
      requestAnimationFrame(() => {
        draftInputRef.current?.focus();
      });
    }
  };

  useEffect(() => {
    if (!user) return;
    const profilesQ = query(collection(db, 'profiles'), where('isPublic', '==', true));
    const unsubProfiles = onSnapshot(
      profilesQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as StudentProfile)
          .filter((p) => p.uid !== user.uid);
        setPeers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'profiles')
    );

    const convQ = query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', user.uid)
    );
    const unsubConvs = onSnapshot(
      convQ,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Conversation))
          .sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
        setConversations(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
    );

    return () => {
      unsubProfiles();
      unsubConvs();
    };
  }, [user]);

  // Load shareable resources when attachment picker opens
  useEffect(() => {
    if (!showAttachPicker || !user) return;
    const unsubMats = onSnapshot(
      query(collection(db, 'studyMaterials'), where('visibility', 'in', ['course', 'public'])),
      (snap) => {
        setAttachMaterials(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as StudyMaterial))
            .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyMaterials')
    );

    const unsubPqs = onSnapshot(
      query(collection(db, 'pastQuestions'), where('isPublic', '==', true)),
      (snap) => {
        setAttachQuestions(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as PastQuestion))
            .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pastQuestions')
    );

    return () => {
      unsubMats();
      unsubPqs();
    };
  }, [showAttachPicker, user]);

  // Resolve full StudentProfile for the active peer UID
  const selectedPeer = useMemo<StudentProfile | null>(() => {
    if (!effectivePeerUid || !user || effectivePeerUid === user.uid) return null;
    const fromDirectory = peers.find((p) => p.uid === effectivePeerUid);
    if (fromDirectory) return fromDirectory;

    const fromConv = conversations.find((c) => c.participantIds.includes(effectivePeerUid));
    if (fromConv) {
      const idx = fromConv.participantIds[0] === effectivePeerUid ? 0 : 1;
      return {
        uid: effectivePeerUid,
        displayName: fromConv.participantNames[idx] || 'Classmate',
        university: fallbackPeer?.uid === effectivePeerUid ? fallbackPeer.university : 'University',
        program: fallbackPeer?.uid === effectivePeerUid ? fallbackPeer.program : 'Student',
        yearOfStudy: fallbackPeer?.uid === effectivePeerUid ? fallbackPeer.yearOfStudy : '',
        courses: fallbackPeer?.uid === effectivePeerUid ? fallbackPeer.courses : [],
        photoURL: fallbackPeer?.uid === effectivePeerUid ? fallbackPeer.photoURL : undefined,
        isPublic: true,
      };
    }

    if (fallbackPeer?.uid === effectivePeerUid) return fallbackPeer;

    return {
      uid: effectivePeerUid,
      displayName: 'Classmate',
      university: 'University',
      program: 'Student',
      yearOfStudy: '',
      courses: [],
      isPublic: true,
    };
  }, [effectivePeerUid, user, peers, conversations, fallbackPeer]);

  // Fetch single profile document as fallback if peer wasn't in public list yet
  useEffect(() => {
    if (!effectivePeerUid || !user || effectivePeerUid === user.uid) return;
    if (peers.some((p) => p.uid === effectivePeerUid)) return;
    let cancelled = false;
    getDoc(doc(db, 'profiles', effectivePeerUid))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          setFallbackPeer(snap.data() as StudentProfile);
        }
      })
      .catch(() => {
        // Public profile may not exist or be private; conversation/stub fallback remains active
      });
    return () => {
      cancelled = true;
    };
  }, [effectivePeerUid, user, peers]);

  // Subscribe to real-time messages for the active DM
  useEffect(() => {
    if (!user || !effectivePeerUid || effectivePeerUid === user.uid) {
      setMessages([]);
      return;
    }
    const convId = getConversationId(user.uid, effectivePeerUid);
    const msgQ = query(
      collection(db, 'conversations', convId, 'messages'),
      where('participantIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      msgQ,
      (snap) => {
        setChatError(null);
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
          .sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));
        setMessages(docs);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      (err) => {
        setChatError(err instanceof Error ? err.message : 'Unable to load messages for this conversation.');
        handleFirestoreError(err, OperationType.LIST, `conversations/${convId}/messages`);
      }
    );
    return () => unsub();
  }, [user, effectivePeerUid]);

  const sendDirectMessage = async (
    textInput: string,
    attachment?: {
      type: 'material' | 'pastQuestion';
      id: string;
      title: string;
      courseCode: string;
    }
  ) => {
    if (!user || !selectedPeer || sending) return;
    if (selectedPeer.uid === user.uid) {
      setChatError('You cannot send a direct message to yourself.');
      return;
    }
    const text = clampString(textInput.trim(), 4000);
    if (!text) return;

    const convId = getConversationId(user.uid, selectedPeer.uid);
    const sortedIds = [user.uid, selectedPeer.uid].sort();
    const myName = clampString(profile?.displayName || user.displayName || 'Student', 120) || 'Student';
    const peerName = clampString(selectedPeer.displayName, 120) || 'Student';
    const sortedNames = sortedIds[0] === user.uid ? [myName, peerName] : [peerName, myName];

    setSending(true);
    setChatError(null);
    let currentOp: (typeof OperationType)[keyof typeof OperationType] = OperationType.GET;
    let currentPath = `conversations/${convId}`;

    try {
      const convRef = doc(db, 'conversations', convId);
      const convSnap = await getDoc(convRef);
      let participantIds = sortedIds;

      if (!convSnap.exists()) {
        currentOp = OperationType.CREATE;
        await setDoc(convRef, {
          participantIds: sortedIds,
          participantNames: sortedNames,
          lastMessage: clampString(text, 300),
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
          lastMessage: clampString(text, 300),
          updatedAt: serverTimestamp(),
        });
      }

      currentOp = OperationType.CREATE;
      currentPath = `conversations/${convId}/messages`;
      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        senderId: user.uid,
        senderName: myName,
        participantIds,
        text,
        ...(attachment
          ? {
              sharedResourceType: attachment.type,
              sharedResourceId: attachment.id,
              sharedResourceTitle: clampString(attachment.title, 180) || 'Shared Resource',
              sharedResourceCourse: clampString(attachment.courseCode, 24),
            }
          : {}),
        createdAt: serverTimestamp(),
      });

      setDraft('');
      setShowAttachPicker(false);
      setTimeout(() => draftInputRef.current?.focus(), 0);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
      handleFirestoreError(err, currentOp, currentPath);
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await sendDirectMessage(draft);
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!user || !selectedPeer || deletingMsgId) return;
    const convId = getConversationId(user.uid, selectedPeer.uid);
    setDeletingMsgId(msgId);
    try {
      await deleteDoc(doc(db, 'conversations', convId, 'messages', msgId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `conversations/${convId}/messages/${msgId}`);
    } finally {
      setDeletingMsgId(null);
    }
  };

  const myCourses = profile?.courses || [];

  const filteredConversations = conversations.filter((conv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const otherIdx = conv.participantIds[0] === user?.uid ? 1 : 0;
    const otherName = (conv.participantNames[otherIdx] || '').toLowerCase();
    const otherPeer = peers.find((p) => p.uid === conv.participantIds[otherIdx]);
    return (
      otherName.includes(q) ||
      conv.lastMessage.toLowerCase().includes(q) ||
      (otherPeer?.courses || []).some((c) => c.toLowerCase().includes(q))
    );
  });

  const filteredPeers = peers.filter((p) => {
    if (onlySameCourses && myCourses.length > 0) {
      const hasShared = p.courses.some((c) => myCourses.includes(c));
      if (!hasShared) return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.displayName.toLowerCase().includes(q) ||
      p.university.toLowerCase().includes(q) ||
      p.program.toLowerCase().includes(q) ||
      p.courses.some((c) => c.toLowerCase().includes(q))
    );
  });

  const suggestedPeers = useMemo(() => {
    return [...peers]
      .sort((a, b) => {
        const aShared = a.courses.filter((c) => myCourses.includes(c)).length;
        const bShared = b.courses.filter((c) => myCourses.includes(c)).length;
        return bShared - aShared;
      })
      .slice(0, 4);
  }, [peers, myCourses]);

  const handleOpenConversation = (conv: Conversation) => {
    if (!user) return;
    const otherUid = conv.participantIds.find((id) => id !== user.uid);
    if (!otherUid) return;
    const foundPeer = peers.find((p) => p.uid === otherUid);
    if (foundPeer) {
      setActivePeer(foundPeer);
    } else {
      const otherName =
        conv.participantIds[0] === otherUid ? conv.participantNames[0] : conv.participantNames[1];
      setActivePeer({
        uid: otherUid,
        displayName: otherName || 'Classmate',
        university: 'University',
        program: 'Student',
        yearOfStudy: '',
        courses: [],
        isPublic: true,
      });
    }
  };

  const attachableResources = useMemo(() => {
    const q = attachSearch.trim().toLowerCase();
    const matItems = attachMaterials.map((m) => ({
      type: 'material' as const,
      id: m.id,
      title: m.title,
      courseCode: m.courseCode,
      subtitle: m.materialType,
    }));
    const pqItems = attachQuestions.map((p) => ({
      type: 'pastQuestion' as const,
      id: p.id,
      title: p.title,
      courseCode: p.courseCode,
      subtitle: `${p.examType} ${p.examYear}`,
    }));
    const combined = [...matItems, ...pqItems];
    if (!q) return combined.slice(0, 14);
    return combined
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.courseCode.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [attachMaterials, attachQuestions, attachSearch]);

  const activeSharedCourses = selectedPeer
    ? selectedPeer.courses.filter((c) => myCourses.includes(c))
    : [];

  return (
    <div className="space-y-4">
      {/* Messenger Shell (WhatsApp-style two-pane on desktop, full-screen DM drill-down on mobile) */}
      <div className="flex h-[calc(100vh-8.75rem)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Left Pane: Chats & Classmates Directory */}
        <aside
          className={`${
            selectedPeer ? 'hidden lg:flex' : 'flex'
          } w-full shrink-0 flex-col border-slate-200 bg-white lg:w-[350px] lg:border-r xl:w-[380px] dark:border-slate-800 dark:bg-slate-900`}
        >
          {/* Left Header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                name={profile?.displayName || user?.displayName || 'ST'}
                photoURL={profile?.photoURL || user?.photoURL}
                size="md"
                variant="blue"
              />
              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Messages
                </h1>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {conversations.length} {conversations.length === 1 ? 'chat' : 'chats'} · {peers.length} classmates
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSidebarTab((t) => (t === 'chats' ? 'peers' : 'chats'))}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-transform hover:brightness-105 active:scale-[0.98] whitespace-nowrap"
              title={sidebarTab === 'chats' ? 'Start a new DM' : 'Back to recent chats'}
            >
              {sidebarTab === 'chats' ? (
                <>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  New DM
                </>
              ) : (
                <>
                  <MessagesSquare className="h-3.5 w-3.5" />
                  Chats
                </>
              )}
            </button>
          </div>

          {/* Search & Switcher */}
          <div className="space-y-2.5 border-b border-slate-200/80 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
            <SegmentedTabs
              layoutGroup="peers-sidebar-tab"
              fullWidth
              size="xs"
              value={sidebarTab}
              onChange={setSidebarTab}
              options={[
                { id: 'chats', label: `Chats (${conversations.length})` },
                { id: 'peers', label: `Classmates (${peers.length})` },
              ]}
            />

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    sidebarTab === 'chats'
                      ? 'Search chats or classmates...'
                      : 'Search name, course, major...'
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {sidebarTab === 'peers' && (
                <button
                  type="button"
                  onClick={() => setOnlySameCourses((v) => !v)}
                  className={`shrink-0 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    onlySameCourses
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  My Courses
                </button>
              )}
            </div>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto">
            {sidebarTab === 'chats' ? (
              filteredConversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <MessagesSquare className="h-6 w-6" />
                  </div>
                  <p className="mt-3 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {conversations.length === 0 ? 'No direct messages yet' : 'No matching chats'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Pick any classmate from the directory to open a real-time study DM.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('peers')}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:brightness-105 whitespace-nowrap"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Browse Classmates
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredConversations.map((conv) => {
                    const otherIdx = conv.participantIds[0] === user?.uid ? 1 : 0;
                    const otherUid = conv.participantIds[otherIdx];
                    const otherName = conv.participantNames[otherIdx] || 'Student';
                    const otherPeer = peers.find((p) => p.uid === otherUid);
                    const active = selectedPeer?.uid === otherUid;

                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => handleOpenConversation(conv)}
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                          active
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/45'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <UserAvatar
                          name={otherName}
                          photoURL={otherPeer?.photoURL}
                          size="md"
                          variant={active ? 'blue' : 'slate'}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={`truncate text-sm font-semibold ${
                                active
                                  ? 'text-indigo-700 dark:text-indigo-300'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {otherName}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-slate-400 tabular-nums">
                              {formatTimestamp(conv.updatedAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {conv.lastMessage}
                          </p>
                          {otherPeer && otherPeer.courses.length > 0 && (
                            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              {otherPeer.courses.slice(0, 3).join(' · ')}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : filteredPeers.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <Users className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No classmates match your current filter.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredPeers.map((peer) => {
                  const sharedCourses = peer.courses.filter((c) => myCourses.includes(c));
                  const isActive = selectedPeer?.uid === peer.uid;
                  return (
                    <button
                      key={peer.uid}
                      type="button"
                      onClick={() => setActivePeer(peer)}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors ${
                        isActive
                          ? 'bg-indigo-50/90 dark:bg-indigo-950/45'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <UserAvatar
                          name={peer.displayName}
                          photoURL={peer.photoURL}
                          size="md"
                          variant={isActive ? 'blue' : 'slate'}
                        />
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-semibold ${
                              isActive
                                ? 'text-indigo-700 dark:text-indigo-300'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {peer.displayName}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {peer.program}
                            {peer.yearOfStudy ? ` · ${peer.yearOfStudy}` : ''}
                          </p>
                          {peer.courses.length > 0 && (
                            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                              {peer.courses.join(' · ')}
                            </p>
                          )}
                          {sharedCourses.length > 0 && (
                            <p className="mt-0.5 truncate font-mono text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                              Shared: {sharedCourses.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`mt-1 shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        Open DM
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Right Pane: Real-time WhatsApp-style DM Window */}
        <section
          className={`${
            selectedPeer ? 'flex' : 'hidden lg:flex'
          } min-w-0 flex-1 flex-col bg-chat-canvas`}
        >
          {!selectedPeer ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                className="max-w-md rounded-2xl border border-slate-200/90 bg-white/95 p-7 shadow-sm backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-sm">
                  <MessagesSquare className="h-7 w-7" />
                </div>
                <h2 className="mt-4 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Direct Study Messages
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Select a recent conversation or click any classmate to open a live DM thread, share lecture slides, and exchange past papers.
                </p>

                {suggestedPeers.length > 0 && (
                  <div className="mt-5 border-t border-slate-200 pt-4 text-left dark:border-slate-800">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Quick Start with Classmates
                    </p>
                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {suggestedPeers.map((peer) => (
                        <button
                          key={peer.uid}
                          type="button"
                          onClick={() => setActivePeer(peer)}
                          className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/35"
                        >
                          <UserAvatar
                            name={peer.displayName}
                            photoURL={peer.photoURL}
                            size="sm"
                            variant="blue"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {peer.displayName}
                            </p>
                            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                              {peer.courses.slice(0, 2).join(', ') || peer.program}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          ) : (
            <>
              {/* DM Top Bar */}
              <div className="border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setActivePeer(null)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      aria-label="Back to chats list"
                      title="Back to chats"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>

                    <UserAvatar
                      name={selectedPeer.displayName}
                      photoURL={selectedPeer.photoURL}
                      size="md"
                      variant="blue"
                    />

                    <div className="min-w-0">
                      <h2 className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                        {selectedPeer.displayName}
                      </h2>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {selectedPeer.program}
                        {selectedPeer.yearOfStudy ? ` · ${selectedPeer.yearOfStudy}` : ''}
                        {activeSharedCourses.length > 0
                          ? ` · Shared: ${activeSharedCourses.join(', ')}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPeerInfo((v) => !v)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      showPeerInfo
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Info className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Peer Info</span>
                  </button>
                </div>

                {/* Collapsible Peer Info Drawer */}
                <AnimatePresence>
                  {showPeerInfo && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                      className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {selectedPeer.university || 'University'} · {selectedPeer.program}
                        </p>
                        {selectedPeer.courses.length > 0 && (
                          <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                            {selectedPeer.courses.join(' · ')}
                          </p>
                        )}
                      </div>
                      {selectedPeer.bio && (
                        <p className="mt-1.5 leading-relaxed text-slate-600 dark:text-slate-400">
                          {selectedPeer.bio}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Scrollable Messages Stream */}
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-5 sm:px-6">
                {messages.length === 0 ? (
                  <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center py-8 text-center">
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
                      <p className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Start a direct conversation with {selectedPeer.displayName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Messages update live in real time. Tap a quick prompt or write your own below.
                      </p>
                      <div className="mt-4 flex flex-col gap-2">
                        {QUICK_STARTERS.map((starter) => (
                          <button
                            key={starter}
                            type="button"
                            onClick={() => void sendDirectMessage(starter)}
                            disabled={sending}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/70 hover:text-indigo-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                          >
                            {starter}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMine = msg.senderId === user?.uid;
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
                    const dayLabel = formatDayHeading(msg.createdAt);
                    const prevDayLabel = prevMsg ? formatDayHeading(prevMsg.createdAt) : null;
                    const showDayHeader = dayLabel !== prevDayLabel;
                    const sameNextSender =
                      nextMsg &&
                      nextMsg.senderId === msg.senderId &&
                      formatDayHeading(nextMsg.createdAt) === dayLabel;

                    return (
                      <React.Fragment key={msg.id}>
                        {showDayHeader && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1 font-mono text-[10px] font-medium text-slate-500 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                              {dayLabel}
                            </span>
                          </div>
                        )}

                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                          className={`group flex items-end gap-2 ${
                            isMine ? 'justify-end' : 'justify-start'
                          } ${sameNextSender ? 'mb-0.5' : 'mb-2.5'}`}
                        >
                          {isMine && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteMessage(msg.id)}
                              disabled={deletingMsgId === msg.id}
                              className="mb-1 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                              title="Delete message"
                              aria-label="Delete message"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <div
                            className={`max-w-[82%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-xs ${
                              isMine
                                ? `bg-gradient-to-br from-blue-600 to-indigo-600 text-white ${
                                    sameNextSender ? 'rounded-br-md' : 'rounded-br-xs'
                                  }`
                                : `border border-slate-200/90 bg-white text-slate-900 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-100 ${
                                    sameNextSender ? 'rounded-bl-md' : 'rounded-bl-xs'
                                  }`
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.text}
                            </p>

                            {msg.sharedResourceId && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onOpenResource && msg.sharedResourceId && msg.sharedResourceType) {
                                    onOpenResource(msg.sharedResourceType, msg.sharedResourceId);
                                  } else {
                                    onNavigate(
                                      msg.sharedResourceType === 'pastQuestion'
                                        ? 'past-questions'
                                        : 'materials'
                                    );
                                  }
                                }}
                                className={`mt-2 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                                  isMine
                                    ? 'border-white/25 bg-white/15 text-white hover:bg-white/25'
                                    : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-950'
                                }`}
                              >
                                {msg.sharedResourceType === 'pastQuestion' ? (
                                  <FileText className="h-4 w-4 shrink-0" />
                                ) : (
                                  <BookOpen className="h-4 w-4 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold">{msg.sharedResourceTitle}</p>
                                  <p className="font-mono text-[10px] opacity-85">
                                    {msg.sharedResourceCourse} · Open in library
                                  </p>
                                </div>
                              </button>
                            )}

                            <div
                              className={`mt-1 flex justify-end font-mono text-[10px] tabular-nums ${
                                isMine ? 'text-blue-100/85' : 'text-slate-400 dark:text-slate-400'
                              }`}
                            >
                              {formatBubbleClock(msg.createdAt)}
                            </div>
                          </div>
                        </motion.div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {chatError && (
                <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {chatError}
                </div>
              )}

              {/* Attach Study Resource Picker Popover */}
              <AnimatePresence>
                {showAttachPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                    className="mx-4 mb-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-2 pb-2">
                      <span className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Send Study Material or Past Paper
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAttachPicker(false)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label="Close attachment picker"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={attachSearch}
                      onChange={(e) => setAttachSearch(e.target.value)}
                      placeholder="Filter materials or past questions by course or title..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <div className="mt-2 max-h-44 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                      {attachableResources.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-400">
                          No matching materials or past papers found.
                        </p>
                      ) : (
                        attachableResources.map((item) => (
                          <button
                            key={`${item.type}:${item.id}`}
                            type="button"
                            disabled={sending}
                            onClick={() =>
                              void sendDirectMessage(
                                draft.trim() ||
                                  `Shared ${item.courseCode} ${
                                    item.type === 'pastQuestion' ? 'past paper' : 'study material'
                                  }: ${item.title}`,
                                {
                                  type: item.type,
                                  id: item.id,
                                  title: item.title,
                                  courseCode: item.courseCode,
                                }
                              )
                            }
                            className="flex w-full items-center justify-between gap-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              {item.type === 'pastQuestion' ? (
                                <FileText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                              ) : (
                                <BookOpen className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {item.title}
                                </p>
                                <p className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                  {item.courseCode} · {item.subtitle}
                                </p>
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                              Send
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* WhatsApp-style Composer Bar */}
              <form
                onSubmit={handleSendMessage}
                className="flex items-end gap-2 border-t border-slate-200 bg-white/95 p-3 sm:px-4 dark:border-slate-800 dark:bg-slate-900/95"
              >
                <button
                  type="button"
                  onClick={() => setShowAttachPicker((v) => !v)}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    showAttachPicker
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                  title="Attach study material or past paper"
                  aria-label="Attach study material or past paper"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <textarea
                  ref={draftInputRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (chatError) setChatError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim() && !sending) {
                        void sendDirectMessage(draft);
                      }
                    }
                  }}
                  placeholder={`Message ${selectedPeer.displayName}...`}
                  className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
                />

                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 text-xs font-semibold text-white shadow-xs transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-45 whitespace-nowrap"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
