import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { BookOpen, FileText, MessageSquare, Search, Send, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { clampString, formatTimestamp, getConversationId, getInitials, getTimestampMillis } from '../lib/utils';
import type { ChatMessage, Conversation, NavSection, StudentProfile } from '../types';

interface PeersChatPageProps {
  initialPeerUid?: string | null;
  onClearInitialPeer?: () => void;
  onOpenResource?: (type: 'material' | 'pastQuestion', resourceId: string) => void;
  onNavigate: (section: NavSection) => void;
}

export function PeersChatPage({ initialPeerUid, onClearInitialPeer, onOpenResource, onNavigate }: PeersChatPageProps) {
  const { user, profile } = useAuth();
  const [peers, setPeers] = useState<StudentProfile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<StudentProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [search, setSearch] = useState('');
  const [onlySameCourses, setOnlySameCourses] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!initialPeerUid || peers.length === 0) return;
    const found = peers.find((p) => p.uid === initialPeerUid);
    if (found) {
      setSelectedPeer(found);
      onClearInitialPeer?.();
    }
  }, [initialPeerUid, peers, onClearInitialPeer]);

  useEffect(() => {
    if (!user || !selectedPeer) {
      setMessages([]);
      return;
    }
    const convId = getConversationId(user.uid, selectedPeer.uid);
    const msgQ = query(
      collection(db, 'conversations', convId, 'messages'),
      where('participantIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      msgQ,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
          .sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));
        setMessages(docs);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `conversations/${convId}/messages`)
    );
    return () => unsub();
  }, [user, selectedPeer]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPeer || !draft.trim()) return;
    const convId = getConversationId(user.uid, selectedPeer.uid);
    const sortedIds = [user.uid, selectedPeer.uid].sort();
    const myName = clampString(profile?.displayName || user.displayName || 'Student', 120);
    const peerName = clampString(selectedPeer.displayName, 120);
    const sortedNames = sortedIds[0] === user.uid ? [myName, peerName] : [peerName, myName];
    const text = clampString(draft, 4000);

    setSending(true);
    try {
      const convRef = doc(db, 'conversations', convId);
      const convSnap = await getDoc(convRef);
      if (!convSnap.exists()) {
        await setDoc(convRef, {
          participantIds: sortedIds,
          participantNames: sortedNames,
          lastMessage: clampString(text, 300),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(convRef, {
          lastMessage: clampString(text, 300),
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        senderId: user.uid,
        senderName: myName,
        participantIds: sortedIds,
        text,
        createdAt: serverTimestamp(),
      });
      setDraft('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `conversations/${convId}/messages`);
    } finally {
      setSending(false);
    }
  };

  const myCourses = profile?.courses || [];
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

  const handleOpenConversation = (conv: Conversation) => {
    if (!user) return;
    const otherUid = conv.participantIds.find((id) => id !== user.uid);
    if (!otherUid) return;
    const foundPeer = peers.find((p) => p.uid === otherUid);
    if (foundPeer) {
      setSelectedPeer(foundPeer);
    } else {
      const otherName =
        conv.participantIds[0] === otherUid ? conv.participantNames[0] : conv.participantNames[1];
      setSelectedPeer({
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Student Peers &amp; Study Chat
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Discover classmates enrolled in the same courses, message them in real time, and exchange notes or past papers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, course code, major..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={() => setOnlySameCourses((v) => !v)}
            className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              onlySameCourses
                ? 'border-blue-700 bg-blue-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            Shares My Courses
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Sidebar: Student Directory & Recent Threads */}
        <div className="space-y-6 lg:col-span-5">
          {conversations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <MessageSquare className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Recent Conversations
                </h2>
              </div>

              <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
                {conversations.map((conv) => {
                  const otherIdx = conv.participantIds[0] === user?.uid ? 1 : 0;
                  const otherUid = conv.participantIds[otherIdx];
                  const otherName = conv.participantNames[otherIdx] || 'Student';
                  const active = selectedPeer?.uid === otherUid;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => handleOpenConversation(conv)}
                      className={`flex w-full items-center gap-3 py-3 text-left transition-colors ${
                        active ? 'opacity-100' : 'hover:opacity-80'
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {getInitials(otherName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-semibold ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-slate-100'}`}>
                            {otherName}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatTimestamp(conv.updatedAt)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {conv.lastMessage}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Student Directory ({filteredPeers.length})
                </h2>
              </div>
            </div>

            {filteredPeers.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No other student profiles match your search yet.
                </p>
              </div>
            ) : (
              <div className="mt-2 max-h-[460px] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
                {filteredPeers.map((peer) => {
                  const sharedCourses = peer.courses.filter((c) => myCourses.includes(c));
                  const isActive = selectedPeer?.uid === peer.uid;
                  return (
                    <div key={peer.uid} className="flex items-start justify-between gap-3 py-3.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {getInitials(peer.displayName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {peer.displayName}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {peer.program} · {peer.yearOfStudy}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {peer.university}
                            {peer.courses.length > 0 ? ` · ${peer.courses.join(', ')}` : ''}
                          </p>
                          {sharedCourses.length > 0 && (
                            <p className="mt-1 font-mono text-[11px] font-medium text-blue-700 dark:text-blue-400">
                              Shared courses: {sharedCourses.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedPeer(peer)}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                          isActive
                            ? 'bg-blue-700 text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        Message
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Real-time Conversation Window */}
        <div className="flex min-h-[540px] flex-col rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          {!selectedPeer ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="h-9 w-9 text-slate-300 dark:text-slate-600" />
              <h3 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Select a classmate to start studying together
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Choose any student from the directory on the left to discuss coursework, clarify exam solutions, or share notes.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold text-white">
                    {getInitials(selectedPeer.displayName)}
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedPeer.displayName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedPeer.program}
                      {selectedPeer.courses.length > 0 ? ` · ${selectedPeer.courses.join(', ')}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-6">
                {messages.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-400">
                    No messages yet. Say hello or ask about a course topic!
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.senderId === user?.uid;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                            isMine
                              ? 'bg-blue-700 text-white'
                              : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100'
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                          {msg.sharedResourceId && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onOpenResource && msg.sharedResourceId && msg.sharedResourceType) {
                                  onOpenResource(msg.sharedResourceType, msg.sharedResourceId);
                                } else {
                                  onNavigate(msg.sharedResourceType === 'pastQuestion' ? 'past-questions' : 'materials');
                                }
                              }}
                              className={`mt-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                                isMine
                                  ? 'border-blue-500 bg-blue-800/60 text-white hover:bg-blue-800'
                                  : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                              }`}
                            >
                              {msg.sharedResourceType === 'pastQuestion' ? (
                                <FileText className="h-4 w-4 shrink-0" />
                              ) : (
                                <BookOpen className="h-4 w-4 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{msg.sharedResourceTitle}</p>
                                <p className="font-mono text-[10px] opacity-80">
                                  {msg.sharedResourceCourse} · Open in library
                                </p>
                              </div>
                            </button>
                          )}
                        </div>
                        <span className="mt-1 text-[10px] text-slate-400">
                          {isMine ? 'You' : msg.senderName} · {formatTimestamp(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="flex items-center gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Message ${selectedPeer.displayName}...`}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
