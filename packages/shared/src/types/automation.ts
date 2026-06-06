import type { AgentThread, ProviderId, RuntimeMode } from "./thread.js";

export interface AutomationRepo {
  id: string;
  userId: string | null;
  deviceId: string | null;
  name: string;
  defaultBranch: string;
  localPath: string;
  githubUrl: string | null;
  /** @deprecated Use forgeUrl. */
  forgeUrl?: string | null;
  strategy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRepoRequest {
  name: string;
  defaultBranch?: string;
  localPath: string;
  deviceId?: string;
  forgeUrl?: string;
  /** @deprecated Use forgeUrl. */
  githubUrl?: string;
}

export interface UpdateRepoRequest {
  name?: string;
  defaultBranch?: string;
  localPath?: string;
  deviceId?: string;
  forgeUrl?: string;
  /** @deprecated Use forgeUrl. */
  githubUrl?: string;
  strategy?: string | null;
}

export type PlanStatus = "draft" | "active" | "completed" | "archived";
export type PlanTaskStatus = "proposed" | "approved" | "running" | "completed" | "skipped";

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: PlanTaskStatus;
  skillCandidate?: boolean;
  skillTitle?: string;
  skillRationale?: string;
  threadId?: string;
  dependsOn?: string[];
}

export interface AutomationPlan {
  id: string;
  repoId: string;
  userId: string | null;
  title: string;
  status: PlanStatus;
  tasks: PlanTask[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanRequest {
  title?: string;
  tasks?: PlanTask[];
}

export interface UpdatePlanRequest {
  title?: string;
  status?: PlanStatus;
  tasks?: PlanTask[];
}

export interface GeneratePlanTasksRequest {
  prompt?: string;
  provider?: ProviderId;
  model?: string | null;
}

export type JaitTodoStatus = "open" | "in_progress" | "done";
export type JaitTodoPriority = "low" | "normal" | "high";

export interface JaitTodo {
  id: string;
  repoId: string;
  userId: string | null;
  message: string;
  status: JaitTodoStatus;
  priority: JaitTodoPriority;
  dueDate: string | null;
  tags: string;
  completedAt: string | null;
  completionHistory: string;
  sourceThreadId: string | null;
  sourceThreadTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RepoProposal = JaitTodo;

export interface CreateJaitTodoRequest {
  message: string;
  status?: JaitTodoStatus;
  priority?: JaitTodoPriority;
  dueDate?: string | null;
  tags?: string[];
  sourceThreadId?: string | null;
  sourceThreadTitle?: string | null;
}

export type CreateRepoProposalRequest = CreateJaitTodoRequest;

export interface UpdateJaitTodoRequest {
  message?: string;
  status?: JaitTodoStatus;
  priority?: JaitTodoPriority;
  dueDate?: string | null;
  tags?: string[];
}

export type UpdateRepoProposalRequest = UpdateJaitTodoRequest;

export interface GenerateJaitTodosRequest {
  prompt?: string;
  provider?: ProviderId;
  model?: string | null;
  runtimeMode?: RuntimeMode;
}

export type ReminderStatus = "active" | "archived";

export interface ReminderSession {
  id: string;
  userId: string | null;
  projectId: string | null;
  name: string | null;
  projectPath: string | null;
  createdAt: string;
  lastActiveAt: string;
  status: string | null;
  metadata: string | null;
}

export interface ReminderProject {
  id: string;
  userId: string | null;
  title: string | null;
  rootPath: string | null;
  nodeId: string | null;
  createdAt: string;
  lastActiveAt: string;
  status: string | null;
  metadata: string | null;
  sessions: ReminderSession[];
  reminderCount: number;
}

export interface ReminderRecord {
  id: string;
  kind?: "page" | "engine";
  userId: string | null;
  projectId: string | null;
  sessionId: string | null;
  content: string;
  sourceType: string;
  sourceId: string | null;
  sourceSurface: string;
  status: ReminderStatus;
  tags: string;
  usageCount: number;
  lastRetrievedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderSnapshot {
  reminders: ReminderRecord[];
  projects: ReminderProject[];
  hasMoreProjects: boolean;
  threads: AgentThread[];
}

export interface CreateReminderRequest {
  content: string;
  projectId?: string | null;
  sessionId?: string | null;
  tags?: string[];
  sourceType?: string;
  sourceId?: string | null;
  sourceSurface?: string;
}

export interface UpdateReminderRequest {
  content?: string;
  projectId?: string | null;
  sessionId?: string | null;
  status?: ReminderStatus;
  tags?: string[];
}

export interface UserSecretRecord {
  id: string;
  userId: string | null;
  type: string;
  key: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface CreateUserSecretRequest {
  type: string;
  key: string;
  label: string;
  value: string;
}
