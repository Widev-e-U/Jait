export interface SessionDescriptor {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface SessionRouter {
  create(name: string, projectId: string): Promise<SessionDescriptor>;
  list(projectId?: string): Promise<SessionDescriptor[]>;
  activate(sessionId: string): Promise<void>;
  getActive(projectId: string): Promise<SessionDescriptor | null>;
}
