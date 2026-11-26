import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Link2, Moon, Plus, Save, Sun, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT_EXPO } from '../components/MotionPrimitives';
import { SearchableSelectCombobox } from '../components/SearchableSelectCombobox';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { GHANA_PROGRAMS, GHANA_UNIVERSITIES } from '../data/ghanaAcademics';
import { compressProfileImage, isSafeAvatarUrl } from '../lib/avatar';
import { normalizeCourseCode } from '../lib/utils';

export function ProfilePage() {
  const { user, profile, updateProfileData, sendPasswordReset, theme, toggleTheme } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [university, setUniversity] = useState('');
  const [program, setProgram] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('Year 1');
  const [bio, setBio] = useState('');
  const [courses, setCourses] = useState<string[]>([]);
  const [newCourse, setNewCourse] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [photoURL, setPhotoURL] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetSentNotice, setResetSentNotice] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const usesPasswordAuth = Boolean(user?.providerData?.some((p) => p.providerId === 'password'));

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setUniversity(profile.university || '');
    setProgram(profile.program || '');
    setYearOfStudy(profile.yearOfStudy || 'Year 1');
    setBio(profile.bio || '');
    setCourses(profile.courses || []);
    setInterests(profile.studyInterests || []);
    setIsPublic(profile.isPublic !== false);
    setPhotoURL(profile.photoURL || '');
  }, [profile]);

  const handleAddCourse = () => {
    const code = normalizeCourseCode(newCourse);
    if (!code || courses.includes(code) || courses.length >= 15) return;
    setCourses([...courses, code]);
    setNewCourse('');
  };

  const handleAddInterest = () => {
    const item = newInterest.trim().slice(0, 60);
    if (!item || interests.includes(item) || interests.length >= 10) return;
    setInterests([...interests, item]);
    setNewInterest('');
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoBusy(true);
    setPhotoError(null);
    setSavedNotice(null);
    try {
      const compressed = await compressProfileImage(file);
      await updateProfileData({ photoURL: compressed });
      setPhotoURL(compressed);
      setShowUrlInput(false);
      setUrlDraft('');
      setSavedNotice('Profile picture updated and synced to the campus directory.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to upload profile picture.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleApplyPhotoUrl = async () => {
    const trimmed = urlDraft.trim();
    if (!trimmed || !/^https?:\/\/\S+$/i.test(trimmed) || !isSafeAvatarUrl(trimmed)) {
      setPhotoError('Enter a valid image link starting with https:// or http://.');
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    setSavedNotice(null);
    try {
      await updateProfileData({ photoURL: trimmed });
      setPhotoURL(trimmed);
      setShowUrlInput(false);
      setUrlDraft('');
      setSavedNotice('Profile picture updated and synced to the campus directory.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to save image URL.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    setPhotoError(null);
    setSavedNotice(null);
    try {
      await updateProfileData({ photoURL: '' });
      setPhotoURL('');
      setSavedNotice('Profile picture removed.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to remove profile picture.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(null);
    setSaveError(null);
    try {
      await updateProfileData({
        displayName: displayName.trim() || 'University Student',
        university: university.trim() || 'University',
        program: program.trim() || 'Undergraduate',
        yearOfStudy,
        bio: bio.trim(),
        courses,
        studyInterests: interests,
        photoURL,
        isPublic,
      });
      setSavedNotice('Profile saved and synced to the campus directory.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    setResetSentNotice(null);
    try {
      await sendPasswordReset(user.email);
      setResetSentNotice(`Password reset link sent to ${user.email}.`);
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Account &amp; Student Profile
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure your enrolled courses and academic bio so peers reading the same courses can connect with you.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>
      </div>

      {/* Account Identity Header */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <div className="relative shrink-0">
              <UserAvatar
                name={displayName || user?.displayName || 'ST'}
                photoURL={photoURL || user?.photoURL}
                size="lg"
                variant="blue"
              />
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                title="Upload profile picture"
                aria-label="Upload profile picture"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handlePhotoFileChange}
                className="hidden"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                {displayName || user?.displayName}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Account Email: {user?.email} (private, never shown in public peer directory)
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Sign-in Method: {usesPasswordAuth ? 'Email & Password' : 'Google Account'} ·{' '}
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {user?.emailVerified ? 'Verified Email' : 'Verification Pending'}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {photoBusy ? 'Updating Photo...' : photoURL ? 'Change Photo' : 'Upload Photo'}
                </button>
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => {
                    setShowUrlInput((v) => !v);
                    setPhotoError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Use Image URL
                </button>
                {photoURL && (
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={handleRemovePhoto}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>
              {resetSentNotice && (
                <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {resetSentNotice}
                </p>
              )}
            </div>
          </div>

          {usesPasswordAuth && user?.email && (
            <button
              type="button"
              onClick={handleSendPasswordReset}
              disabled={sendingReset}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {sendingReset ? 'Sending...' : 'Reset Password'}
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {showUrlInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
              className="flex flex-wrap items-center gap-2 overflow-hidden border-t border-slate-200 pt-4 dark:border-slate-800"
            >
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={photoBusy || !urlDraft.trim()}
                onClick={handleApplyPhotoUrl}
                className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                Apply URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUrlInput(false);
                  setUrlDraft('');
                  setPhotoError(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {photoError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {photoError}
          </p>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Full Display Name
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <SearchableSelectCombobox
            id="profile-university"
            label="University / Institution (Ghana)"
            value={university}
            onChange={setUniversity}
            options={GHANA_UNIVERSITIES}
            required
            maxLength={150}
            allLabel="Ghanaian institutions"
            placeholder="Search or type university (e.g., UG, KNUST, UCC)..."
            helperText="Pick from the list, search by name/acronym, or type your own if unlisted."
          />

          <SearchableSelectCombobox
            id="profile-program"
            label="Degree Program / Major"
            value={program}
            onChange={setProgram}
            options={GHANA_PROGRAMS}
            required
            maxLength={150}
            allLabel="degree programs"
            placeholder="Search or type program (e.g., BSc Computer Science)..."
            helperText="Search across Ghanaian programs or type your exact major."
          />

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Year / Level of Study
            </label>
            <select
              value={yearOfStudy}
              onChange={(e) => setYearOfStudy(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="Year 1">Year 1 / Level 100</option>
              <option value="Year 2">Year 2 / Level 200</option>
              <option value="Year 3">Year 3 / Level 300</option>
              <option value="Year 4">Year 4 / Level 400</option>
              <option value="Masters">Postgraduate / Masters</option>
              <option value="PhD">Doctoral / PhD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Academic Bio
          </label>
          <textarea
            rows={3}
            maxLength={600}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Share your study schedule, exam goals, or topics you enjoy helping classmates with..."
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        {/* Courses Manager */}
        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Enrolled Course Codes (used to match notes, past questions, and study peers)
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newCourse}
              onChange={(e) => setNewCourse(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCourse();
                }
              }}
              placeholder="e.g. CS301, MATH204"
              className="w-60 rounded-lg border border-slate-200 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 uppercase focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleAddCourse}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Course
            </button>
          </div>
          {courses.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {courses.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCourses(courses.filter((c) => c !== code))}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-medium text-slate-800 hover:border-red-300 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  title="Remove course"
                >
                  <span>{code}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Study Interests */}
        <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Study Interests &amp; Focus Areas
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newInterest}
              onChange={(e) => setNewInterest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddInterest();
                }
              }}
              placeholder="e.g. Algorithms, Econometrics"
              className="w-60 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleAddInterest}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Topic
            </button>
          </div>
          {interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {interests.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setInterests(interests.filter((x) => x !== item))}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-red-300 hover:text-red-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <span>{item}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-800">
          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            Show my profile in the Student Peer Directory (allows classmates to find and message me)
          </label>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
          >
            {saving ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <AnimatePresence>
          {saveError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {saveError}
            </motion.p>
          )}
          {savedNotice && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {savedNotice}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
