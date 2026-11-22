export type NavSection =
  | 'overview'
  | 'past-questions'
  | 'materials'
  | 'ai-studio'
  | 'calendar'
  | 'tasks'
  | 'progress'
  | 'peers'
  | 'profile';

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentProfile {
  uid: string;
  displayName: string;
  university: string;
  program: string;
  yearOfStudy: string;
  bio?: string;
  courses: string[];
  studyInterests?: string[];
  photoURL?: string;
  isPublic: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Enrollment {
  id: string;
  ownerId: string;
  courseCode: string;
  courseTitle: string;
  instructor?: string;
  credits: number;
  targetGrade: number;
  currentScore: number;
  completedModules: number;
  totalModules: number;
  semester?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SemesterOption = 'Fall' | 'Spring' | 'Summer' | 'Semester 1' | 'Semester 2';
export type ExamTypeOption = 'Midterm' | 'Final' | 'Quiz' | 'Assignment' | 'Lab Exam';

export interface PastQuestion {
  id: string;
  authorId: string;
  authorName: string;
  courseCode: string;
  courseTitle: string;
  university?: string;
  examYear: number;
  semester: SemesterOption;
  examType: ExamTypeOption;
  title: string;
  questionText: string;
  solutionText?: string;
  fileName?: string;
  fileMimeType?: string;
  fileDataUrl?: string;
  isPublic: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PastQuestionComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt?: unknown;
}

export type MaterialTypeOption = 'Notes' | 'Slides' | 'Cheat Sheet' | 'Lab Guide' | 'Reading';
export type MaterialVisibility = 'course' | 'public' | 'private';

export interface StudyMaterial {
  id: string;
  authorId: string;
  authorName: string;
  courseCode: string;
  courseTitle: string;
  materialType: MaterialTypeOption;
  title: string;
  description?: string;
  contentText: string;
  aiSummary?: string;
  fileName?: string;
  fileMimeType?: string;
  fileDataUrl?: string;
  externalUrl?: string;
  visibility: MaterialVisibility;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface StudyTask {
  id: string;
  ownerId: string;
  title: string;
  courseCode?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  estimatedMinutes?: number;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CalendarEventType = 'assignment' | 'exam' | 'lecture' | 'study_session';

export interface CalendarEvent {
  id: string;
  ownerId: string;
  title: string;
  courseCode?: string;
  eventType: CalendarEventType;
  date: string;
  startTime?: string;
  location?: string;
  description?: string;
  completed: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyLog {
  id: string;
  ownerId: string;
  courseCode: string;
  topic?: string;
  durationMinutes: number;
  loggedDate: string;
  createdAt?: unknown;
}

export interface QuizAttempt {
  id: string;
  ownerId: string;
  title: string;
  courseCode?: string;
  score: number;
  totalQuestions: number;
  createdAt?: unknown;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantNames: string[];
  lastMessage: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  participantIds: string[];
  text: string;
  sharedResourceType?: 'material' | 'pastQuestion';
  sharedResourceId?: string;
  sharedResourceTitle?: string;
  sharedResourceCourse?: string;
  createdAt?: unknown;
}

export interface GeneratedQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
  hint: string;
}
