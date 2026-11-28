import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  Globe,
  Lock,
  Megaphone,
  MessageSquare,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ModalShell, SegmentedTabs } from '../components/MotionPrimitives';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import {
  ADMIN_DISPLAY_EMAIL,
  adminDeleteConversation,
  adminDeleteConversationMessage,
  adminDeletePastQuestion,
  adminDeletePastQuestionComment,
  adminDeleteStudyMaterial,
  adminSavePlatformConfig,
  adminUpdatePastQuestionVisibility,
  adminUpdateStudyMaterialVisibility,
  blockUserAccount,
  isAdminEmail,
  removeUserAccountData,
  unblockUserAccount,
} from '../lib/admin';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatFileSize, formatTimestamp, getTimestampMillis } from '../lib/utils';
import type {
  AnnouncementTone,
  BlockedUserRecord,
  ChatMessage,
  Conversation,
  MaterialVisibility,
  PastQuestion,
  PastQuestionComment,
  StudentProfile,
  StudyMaterial,
  UserAccount,
} from '../types';

type AdminTab = 'users' | 'materials' | 'past-questions' | 'chats' | 'notice';
type UserFilter = 'all' | 'active' | 'blocked' | 'private';

interface JoinedUserRow {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  university: string;
  program: string;
  yearOfStudy: string;
  courses: string[];
  isPublicProfile: boolean;
  hasUserDoc: boolean;
  hasProfileDoc: boolean;
  blocked: BlockedUserRecord | null;
  isAdminAccount: boolean;
  createdAt?: unknown;
}

export function AdminPage() {
  const { user, isAdmin, platformConfig } = useAuth();

  const [tab, setTab] = useState<AdminTab>('users');
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [profilesList, setProfilesList] = useState<StudentProfile[]>([]);
  const [blockedList, setBlockedList] = useState<BlockedUserRecord[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [pastQuestions, setPastQuestions] = useState<PastQuestion[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [noticeMessage, setNoticeMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Filters & search
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState<'all' | MaterialVisibility>('all');
  const [pqSearch, setPqSearch] = useState('');
  const [pqFilter, setPqFilter] = useState<'all' | 'public' | 'hidden'>('all');
  const [chatSearch, setChatSearch] = useState('');

  // Block modal state
  const [blockTarget, setBlockTarget] = useState<JoinedUserRow | null>(null);
  const [blockReason, setBlockReason] = useState('');

  // Remove user modal state
  const [removeTarget, setRemoveTarget] = useState<JoinedUserRow | null>(null);
  const [removeAlsoBlock, setRemoveAlsoBlock] = useState(true);
  const [removePurgeContent, setRemovePurgeContent] = useState(false);
  const [removeBlockReason, setRemoveBlockReason] = useState('');

  // Content inspection modals
  const [previewMaterial, setPreviewMaterial] = useState<StudyMaterial | null>(null);
  const [inspectPq, setInspectPq] = useState<PastQuestion | null>(null);
  const [pqComments, setPqComments] = useState<PastQuestionComment[]>([]);
  const [inspectChat, setInspectChat] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Delete confirmation modal
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'material' | 'pastQuestion' | 'conversation';
    id: string;
    title: string;
  } | null>(null);

  // Platform notice editor state
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerBody, setBannerBody] = useState('');
  const [bannerTone, setBannerTone] = useState<AnnouncementTone>('info');
  const [bannerActive, setBannerActive] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);

  useEffect(() => {
    if (platformConfig) {
      setBannerTitle(platformConfig.announcementTitle || '');
      setBannerBody(platformConfig.announcementBody || '');
      setBannerTone(platformConfig.announcementTone || 'info');
      setBannerActive(Boolean(platformConfig.isActive));
    }
  }, [platformConfig]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setUsersList(snap.docs.map((d) => ({ ...(d.data() as UserAccount), uid: d.id })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubProfiles = onSnapshot(
      collection(db, 'profiles'),
      (snap) => {
        setProfilesList(snap.docs.map((d) => ({ ...(d.data() as StudentProfile), uid: d.id })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'profiles')
    );

    const unsubBlocked = onSnapshot(
      collection(db, 'blockedUsers'),
      (snap) => {
        setBlockedList(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BlockedUserRecord, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'blockedUsers')
    );

    const unsubMaterials = onSnapshot(
      collection(db, 'studyMaterials'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudyMaterial, 'id'>) }));
        list.sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
        setMaterials(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyMaterials')
    );

    const unsubPq = onSnapshot(
      collection(db, 'pastQuestions'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PastQuestion, 'id'>) }));
        list.sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
        setPastQuestions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pastQuestions')
    );

    const unsubConvs = onSnapshot(
      collection(db, 'conversations'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, 'id'>) }));
        list.sort((a, b) => getTimestampMillis(b.updatedAt) - getTimestampMillis(a.updatedAt));
        setConversations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
    );

    return () => {
      unsubUsers();
      unsubProfiles();
      unsubBlocked();
      unsubMaterials();
      unsubPq();
      unsubConvs();
    };
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin || !inspectPq) {
      setPqComments([]);
      return;
    }
    const q = query(collection(db, 'pastQuestions', inspectPq.id, 'comments'), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setPqComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PastQuestionComment, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `pastQuestions/${inspectPq.id}/comments`)
    );
  }, [user, isAdmin, inspectPq]);

  useEffect(() => {
    if (!user || !isAdmin || !inspectChat) {
      setChatMessages([]);
      return;
    }
    const q = query(collection(db, 'conversations', inspectChat.id, 'messages'), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setChatMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `conversations/${inspectChat.id}/messages`)
    );
  }, [user, isAdmin, inspectChat]);

  const joinedUsers = useMemo<JoinedUserRow[]>(() => {
    const userMap = new Map<string, UserAccount>();
    usersList.forEach((u) => userMap.set(u.uid, u));

    const profileMap = new Map<string, StudentProfile>();
    profilesList.forEach((p) => profileMap.set(p.uid, p));

    const blockedMap = new Map<string, BlockedUserRecord>();
    blockedList.forEach((b) => blockedMap.set(b.uid, b));

    const allUids = new Set<string>([
      ...userMap.keys(),
      ...profileMap.keys(),
      ...blockedMap.keys(),
    ]);

    const rows: JoinedUserRow[] = [];
    allUids.forEach((uid) => {
      const u = userMap.get(uid);
      const p = profileMap.get(uid);
      const b = blockedMap.get(uid) || null;
      const email = u?.email || b?.email || '';
      const displayName = p?.displayName || u?.displayName || b?.displayName || 'Removed Account';

      rows.push({
        uid,
        displayName,
        email,
        photoURL: p?.photoURL || u?.photoURL,
        university: p?.university || '—',
        program: p?.program || '—',
        yearOfStudy: p?.yearOfStudy || '',
        courses: p?.courses || [],
        isPublicProfile: p ? p.isPublic : true,
        hasUserDoc: Boolean(u),
        hasProfileDoc: Boolean(p),
        blocked: b,
        isAdminAccount: uid === user?.uid || isAdminEmail(email),
        createdAt: u?.createdAt || p?.createdAt || b?.createdAt,
      });
    });

    rows.sort((a, b) => {
      if (a.isAdminAccount !== b.isAdminAccount) return a.isAdminAccount ? -1 : 1;
      if (Boolean(a.blocked) !== Boolean(b.blocked)) return a.blocked ? 1 : -1;
      return getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt);
    });

    return rows;
  }, [usersList, profilesList, blockedList, user?.uid]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return joinedUsers.filter((row) => {
      if (userFilter === 'active' && row.blocked) return false;
      if (userFilter === 'blocked' && !row.blocked) return false;
      if (userFilter === 'private' && row.isPublicProfile) return false;
      if (!q) return true;
      return (
        row.displayName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.uid.toLowerCase().includes(q) ||
        row.university.toLowerCase().includes(q) ||
        row.program.toLowerCase().includes(q)
      );
    });
  }, [joinedUsers, userSearch, userFilter]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    return materials.filter((m) => {
      if (materialFilter !== 'all' && m.visibility !== materialFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.courseCode.toLowerCase().includes(q) ||
        m.authorName.toLowerCase().includes(q) ||
        m.materialType.toLowerCase().includes(q)
      );
    });
  }, [materials, materialSearch, materialFilter]);

  const filteredPastQuestions = useMemo(() => {
    const q = pqSearch.trim().toLowerCase();
    return pastQuestions.filter((pq) => {
      if (pqFilter === 'public' && !pq.isPublic) return false;
      if (pqFilter === 'hidden' && pq.isPublic) return false;
      if (!q) return true;
      return (
        pq.title.toLowerCase().includes(q) ||
        pq.courseCode.toLowerCase().includes(q) ||
        pq.authorName.toLowerCase().includes(q) ||
        (pq.university || '').toLowerCase().includes(q)
      );
    });
  }, [pastQuestions, pqSearch, pqFilter]);

  const filteredConversations = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!q) return true;
      return (
        c.participantNames.some((n) => n.toLowerCase().includes(q)) ||
        c.participantIds.some((id) => id.toLowerCase().includes(q)) ||
        c.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [conversations, chatSearch]);

  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-white p-8 text-center shadow-xs dark:border-rose-900/60 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Administrator Access Only
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          This control center is restricted exclusively to the verified platform administrator account.
        </p>
      </div>
    );
  }

  const showToast = (tone: 'success' | 'error', text: string) => {
    setNoticeMessage({ tone, text });
  };

  const handleConfirmBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockTarget) return;
    setBusyActionId(blockTarget.uid);
    try {
      await blockUserAccount({
        adminUid: user.uid,
        targetUid: blockTarget.uid,
        email: blockTarget.email,
        displayName: blockTarget.displayName,
        reason: blockReason.trim(),
      });
      showToast('success', `${blockTarget.displayName} has been blocked from accessing the workspace.`);
      setBlockTarget(null);
      setBlockReason('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to block user.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleUnblock = async (row: JoinedUserRow) => {
    setBusyActionId(row.uid);
    try {
      await unblockUserAccount(row.uid);
      showToast('success', `${row.displayName} has been unblocked.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to unblock user.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleConfirmRemoveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!removeTarget) return;
    setBusyActionId(removeTarget.uid);
    try {
      await removeUserAccountData({
        adminUid: user.uid,
        targetUid: removeTarget.uid,
        targetEmail: removeTarget.email,
        targetDisplayName: removeTarget.displayName,
        alsoBlock: removeAlsoBlock,
        purgePublicContent: removePurgeContent,
        blockReason: removeBlockReason.trim(),
      });
      showToast(
        'success',
        removeAlsoBlock
          ? `${removeTarget.displayName} was removed and blocked.`
          : `${removeTarget.displayName}'s account data was removed.`
      );
      setRemoveTarget(null);
      setRemoveBlockReason('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to remove user.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleMaterialVisibilityChange = async (mat: StudyMaterial, nextVisibility: MaterialVisibility) => {
    if (mat.visibility === nextVisibility) return;
    setBusyActionId(mat.id);
    try {
      await adminUpdateStudyMaterialVisibility(mat.id, nextVisibility, mat.fileChunkCount);
      showToast('success', `Updated "${mat.title}" visibility to ${nextVisibility}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to update visibility.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleTogglePastQuestionPublic = async (pq: PastQuestion) => {
    setBusyActionId(pq.id);
    try {
      await adminUpdatePastQuestionVisibility(pq.id, !pq.isPublic, pq.fileChunkCount);
      showToast('success', `"${pq.title}" is now ${!pq.isPublic ? 'public' : 'hidden'}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to update past question.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleExecuteDelete = async () => {
    if (!confirmDelete) return;
    setBusyActionId(confirmDelete.id);
    try {
      if (confirmDelete.kind === 'material') {
        await adminDeleteStudyMaterial(confirmDelete.id);
        if (previewMaterial?.id === confirmDelete.id) setPreviewMaterial(null);
      } else if (confirmDelete.kind === 'pastQuestion') {
        await adminDeletePastQuestion(confirmDelete.id);
        if (inspectPq?.id === confirmDelete.id) setInspectPq(null);
      } else {
        await adminDeleteConversation(confirmDelete.id);
        if (inspectChat?.id === confirmDelete.id) setInspectChat(null);
      }
      showToast('success', `Deleted "${confirmDelete.title}".`);
      setConfirmDelete(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete action failed.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBanner(true);
    try {
      await adminSavePlatformConfig(user.uid, {
        announcementTitle: bannerTitle.trim() || 'Campus Notice',
        announcementBody: bannerBody.trim(),
        announcementTone: bannerTone,
        isActive: bannerActive,
      });
      showToast(
        'success',
        bannerActive ? 'Campus announcement published to all students.' : 'Announcement saved (inactive).'
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to save notice.');
    } finally {
      setSavingBanner(false);
    }
  };

  const activeUserCount = joinedUsers.filter((u) => !u.blocked).length;
  const blockedCount = blockedList.length;

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 text-white shadow-sm dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-indigo-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Verified Admin • {ADMIN_DISPLAY_EMAIL}</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Administrator Control Center
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
              Manage student accounts, block or remove abusive users, moderate uploaded study materials and past papers, inspect peer chats, and broadcast campus-wide announcements.
            </p>
          </div>
        </div>
      </section>

      {noticeMessage && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
            noticeMessage.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {noticeMessage.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{noticeMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNoticeMessage(null)}
            className="rounded p-1 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* KPI Metrics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Registered Accounts</span>
            <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {joinedUsers.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {activeUserCount} active
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Blocked Accounts</span>
            <Ban className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {blockedCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Server-enforced blocklist
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Study Materials</span>
            <BookOpen className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {materials.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {materials.filter((m) => m.visibility === 'private').length} private
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Papers &amp; Chats</span>
            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {pastQuestions.length} / {conversations.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Past papers / DM threads
          </p>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="overflow-x-auto pb-1">
        <SegmentedTabs
          layoutGroup="admin-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'users', label: `Users & Access (${joinedUsers.length})` },
            { id: 'materials', label: `Study Materials (${materials.length})` },
            { id: 'past-questions', label: `Past Questions (${pastQuestions.length})` },
            { id: 'chats', label: `Peer Chats (${conversations.length})` },
            { id: 'notice', label: 'Platform Notice' },
          ]}
        />
      </div>

      {/* TAB 1: USERS & ACCESS CONTROL */}
      {tab === 'users' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email, university, program, or UID..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'Active' },
                  { id: 'blocked', label: 'Blocked' },
                  { id: 'private', label: 'Private Profile' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setUserFilter(f.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    userFilter === f.id
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredUsers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                No accounts match your filter.
              </div>
            ) : (
              filteredUsers.map((row) => (
                <div
                  key={row.uid}
                  className={`rounded-xl border bg-white p-4 transition-colors dark:bg-slate-900 ${
                    row.blocked
                      ? 'border-rose-200 bg-rose-50/30 dark:border-rose-900/60 dark:bg-rose-950/15'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <UserAvatar
                        name={row.displayName}
                        photoURL={row.photoURL}
                        size="md"
                        variant={row.blocked ? 'slate' : 'blue'}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                            {row.displayName}
                          </h3>
                          {row.isAdminAccount && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                              <ShieldCheck className="h-3 w-3" />
                              Admin
                            </span>
                          )}
                          {row.blocked ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">
                              <Ban className="h-3 w-3" />
                              Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <UserCheck className="h-3 w-3" />
                              Active
                            </span>
                          )}
                          {!row.isPublicProfile && row.hasProfileDoc && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <Lock className="h-3 w-3" />
                              Private Profile
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
                          {row.email || 'No email stored'} • <span className="font-mono text-[11px] text-slate-400">{row.uid}</span>
                        </p>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {row.university} • {row.program}
                          {row.yearOfStudy ? ` (${row.yearOfStudy})` : ''}
                          {row.courses.length > 0 ? ` • ${row.courses.length} courses` : ''}
                        </p>

                        {row.blocked?.reason && (
                          <p className="mt-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                            Block reason: {row.blocked.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {row.isAdminAccount ? (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                          Protected Admin
                        </span>
                      ) : (
                        <>
                          {row.blocked ? (
                            <button
                              type="button"
                              disabled={busyActionId === row.uid}
                              onClick={() => void handleUnblock(row)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                              <span>{busyActionId === row.uid ? 'Working...' : 'Unblock'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyActionId === row.uid}
                              onClick={() => {
                                setBlockTarget(row);
                                setBlockReason('');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              <span>Block</span>
                            </button>
                          )}

                          {(row.hasUserDoc || row.hasProfileDoc) && (
                            <button
                              type="button"
                              disabled={busyActionId === row.uid}
                              onClick={() => {
                                setRemoveTarget(row);
                                setRemoveAlsoBlock(!row.blocked);
                                setRemovePurgeContent(false);
                                setRemoveBlockReason('');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 2: STUDY MATERIALS MODERATION */}
      {tab === 'materials' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                placeholder="Search materials by title, course, author, or type..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'public', 'course', 'private'] as const).map((vis) => (
                <button
                  key={vis}
                  type="button"
                  onClick={() => setMaterialFilter(vis)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    materialFilter === vis
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {vis}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredMaterials.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                No study materials match your filter.
              </div>
            ) : (
              filteredMaterials.map((mat) => (
                <div
                  key={mat.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {mat.courseCode}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {mat.materialType}
                      </span>
                      <span className="text-[11px] text-slate-400">•</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Updated {formatTimestamp(mat.updatedAt)}
                      </span>
                    </div>
                    <h3 className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {mat.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Uploaded by <span className="font-medium text-slate-700 dark:text-slate-200">{mat.authorName}</span>
                      {mat.fileName ? ` • ${mat.fileName} (${formatFileSize(mat.fileSizeBytes)})` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <select
                      aria-label={`Visibility for ${mat.title}`}
                      value={mat.visibility}
                      disabled={busyActionId === mat.id}
                      onChange={(e) =>
                        void handleMaterialVisibilityChange(mat, e.target.value as MaterialVisibility)
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="public">Public</option>
                      <option value="course">Course</option>
                      <option value="private">Private</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => setPreviewMaterial(mat)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Inspect</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyActionId === mat.id}
                      onClick={() =>
                        setConfirmDelete({ kind: 'material', id: mat.id, title: mat.title })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 3: PAST QUESTIONS & COMMENTS MODERATION */}
      {tab === 'past-questions' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={pqSearch}
                onChange={(e) => setPqSearch(e.target.value)}
                placeholder="Search past papers by title, course, university, or author..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'public', 'hidden'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPqFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    pqFilter === f
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredPastQuestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                No past questions match your filter.
              </div>
            ) : (
              filteredPastQuestions.map((pq) => (
                <div
                  key={pq.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        {pq.courseCode}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {pq.examType} • {pq.semester} {pq.examYear}
                      </span>
                      <span className="text-[11px] text-slate-400">•</span>
                      <span
                        className={`text-[11px] font-semibold ${
                          pq.isPublic
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {pq.isPublic ? 'Public' : 'Hidden'}
                      </span>
                    </div>
                    <h3 className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {pq.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Posted by <span className="font-medium text-slate-700 dark:text-slate-200">{pq.authorName}</span>
                      {pq.university ? ` • ${pq.university}` : ''}
                      {pq.fileName ? ` • ${pq.fileName}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyActionId === pq.id}
                      onClick={() => void handleTogglePastQuestionPublic(pq)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {pq.isPublic ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                      <span>{pq.isPublic ? 'Hide' : 'Make Public'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectPq(pq)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Details &amp; Comments</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyActionId === pq.id}
                      onClick={() =>
                        setConfirmDelete({ kind: 'pastQuestion', id: pq.id, title: pq.title })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 4: PEER CONVERSATIONS OVERSIGHT */}
      {tab === 'chats' && (
        <section className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search conversations by participant or message..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-2.5">
            {filteredConversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                No conversations match your filter.
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {conv.participantNames.join('  ↔  ')}
                    </h3>
                    <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                      {conv.lastMessage || 'No messages yet'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Updated {formatTimestamp(conv.updatedAt)} • IDs: {conv.participantIds.join(', ')}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectChat(conv)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Inspect Thread</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyActionId === conv.id}
                      onClick={() =>
                        setConfirmDelete({
                          kind: 'conversation',
                          id: conv.id,
                          title: conv.participantNames.join(' ↔ '),
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Thread</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 5: PLATFORM ANNOUNCEMENT NOTICE */}
      {tab === 'notice' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Global Campus Announcement
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Publish a live notice banner visible at the top of every student&apos;s workspace for exam updates, rules reminders, or maintenance alerts.
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleSaveNotice(e)} className="mt-6 space-y-4 max-w-2xl">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={bannerActive}
                onChange={(e) => setBannerActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Display announcement banner across the platform</span>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notice Title
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="e.g. Semester Exam Week Guidelines"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tone
                </label>
                <select
                  value={bannerTone}
                  onChange={(e) => setBannerTone(e.target.value as AnnouncementTone)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="info">Info (Indigo)</option>
                  <option value="warning">Warning (Amber)</option>
                  <option value="success">Positive (Emerald)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Message
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={bannerBody}
                onChange={(e) => setBannerBody(e.target.value)}
                placeholder="Write a concise update for all Scholaryx users..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingBanner}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingBanner ? 'Saving...' : 'Save Announcement'}
              </button>
              {bannerActive && (
                <button
                  type="button"
                  disabled={savingBanner}
                  onClick={() => {
                    setBannerActive(false);
                    void adminSavePlatformConfig(user.uid, {
                      announcementTitle: bannerTitle.trim() || 'Campus Notice',
                      announcementBody: bannerBody.trim(),
                      announcementTone: bannerTone,
                      isActive: false,
                    }).then(() => showToast('success', 'Global announcement turned off.'));
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Turn Off Banner
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {/* MODAL: BLOCK USER */}
      <ModalShell open={Boolean(blockTarget)} onClose={() => setBlockTarget(null)} maxWidthClass="max-w-md">
        {blockTarget && (
          <form
            onSubmit={(e) => void handleConfirmBlock(e)}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-amber-700 dark:text-amber-400">
                <Ban className="h-5 w-5" />
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Block Student Account
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Blocking <span className="font-semibold text-slate-900 dark:text-slate-100">{blockTarget.displayName}</span> ({blockTarget.email || blockTarget.uid}) immediately locks them out of the workspace and blocks all database writes at the security rules level.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reason (shown to the user)
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Optional note explaining why access was restricted..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyActionId === blockTarget.uid}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
              >
                {busyActionId === blockTarget.uid ? 'Blocking...' : 'Confirm Block'}
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* MODAL: REMOVE USER */}
      <ModalShell open={Boolean(removeTarget)} onClose={() => setRemoveTarget(null)} maxWidthClass="max-w-lg">
        {removeTarget && (
          <form
            onSubmit={(e) => void handleConfirmRemoveUser(e)}
            className="rounded-2xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-900/60 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-400">
                <Trash2 className="h-5 w-5" />
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Remove User Account Data
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              This removes <span className="font-semibold text-slate-900 dark:text-slate-100">{removeTarget.displayName}</span>&apos;s account document, campus directory profile, enrollments, tasks, calendar events, study logs, and saved quiz attempts.
            </p>

            <div className="mt-4 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={removeAlsoBlock}
                  onChange={(e) => setRemoveAlsoBlock(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>
                  <strong className="font-semibold">Also block this user</strong> so they cannot re-create a profile or access the workspace if they sign in again.
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={removePurgeContent}
                  onChange={(e) => setRemovePurgeContent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>
                  <strong className="font-semibold">Also purge shared content</strong> (delete all study materials, past papers, and DM threads created by this user).
                </span>
              </label>
            </div>

            {removeAlsoBlock && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Block reason (optional)
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={removeBlockReason}
                  onChange={(e) => setRemoveBlockReason(e.target.value)}
                  placeholder="Account removed by administrator."
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-rose-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyActionId === removeTarget.uid}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
              >
                {busyActionId === removeTarget.uid ? 'Removing...' : 'Remove User'}
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* MODAL: PREVIEW STUDY MATERIAL */}
      <ModalShell
        open={Boolean(previewMaterial)}
        onClose={() => setPreviewMaterial(null)}
        maxWidthClass="max-w-2xl"
      >
        {previewMaterial && (
          <div className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {previewMaterial.courseCode} • {previewMaterial.materialType} • {previewMaterial.visibility}
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  {previewMaterial.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Author: {previewMaterial.authorName} ({previewMaterial.authorId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMaterial(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {previewMaterial.description && (
              <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {previewMaterial.description}
              </p>
            )}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
              {previewMaterial.contentText || 'No inline text body (file attachment only).'}
            </div>
          </div>
        )}
      </ModalShell>

      {/* MODAL: INSPECT PAST QUESTION & COMMENTS */}
      <ModalShell open={Boolean(inspectPq)} onClose={() => setInspectPq(null)} maxWidthClass="max-w-2xl">
        {inspectPq && (
          <div className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {inspectPq.courseCode} • {inspectPq.examType} • {inspectPq.semester} {inspectPq.examYear}
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  {inspectPq.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Author: {inspectPq.authorName} ({inspectPq.authorId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectPq(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed whitespace-pre-wrap text-slate-700 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
              {inspectPq.questionText || 'Attachment only (no text body).'}
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Comments ({pqComments.length})
              </h3>
              <div className="mt-2.5 space-y-2">
                {pqComments.length === 0 ? (
                  <p className="text-xs text-slate-400">No comments on this paper.</p>
                ) : (
                  pqComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {comment.authorName}{' '}
                          <span className="font-normal text-slate-400">
                            • {formatTimestamp(comment.createdAt)}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{comment.body}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void adminDeletePastQuestionComment(inspectPq.id, comment.id).then(() =>
                            showToast('success', 'Comment removed.')
                          )
                        }
                        className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      {/* MODAL: INSPECT CONVERSATION THREAD */}
      <ModalShell open={Boolean(inspectChat)} onClose={() => setInspectChat(null)} maxWidthClass="max-w-2xl">
        {inspectChat && (
          <div className="max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  {inspectChat.participantNames.join('  ↔  ')}
                </h2>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{inspectChat.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectChat(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {chatMessages.length === 0 ? (
                <p className="text-xs text-slate-400">No messages in this conversation.</p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {msg.senderName}{' '}
                        <span className="font-normal text-slate-400">
                          • {formatTimestamp(msg.createdAt)}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">
                        {msg.text}
                      </p>
                      {msg.sharedResourceTitle && (
                        <p className="mt-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                          Shared {msg.sharedResourceType}: {msg.sharedResourceTitle}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void adminDeleteConversationMessage(inspectChat.id, msg.id).then(() =>
                          showToast('success', 'Message deleted.')
                        )
                      }
                      className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                      aria-label="Delete message"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </ModalShell>

      {/* MODAL: GENERIC DELETE CONFIRMATION */}
      <ModalShell open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidthClass="max-w-md">
        {confirmDelete && (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-900/60 dark:bg-slate-900">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Confirm Deletion
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{confirmDelete.title}</span>? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyActionId === confirmDelete.id}
                onClick={() => void handleExecuteDelete()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
              >
                {busyActionId === confirmDelete.id ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
