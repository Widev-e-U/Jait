export type PullRequestListState = "open" | "closed" | "merged" | "all";

export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";

export interface PullRequestActor {
  login: string;
  name: string | null;
}

export interface PullRequestLabel {
  name: string;
  color: string;
}

export interface PullRequestCheck {
  name: string;
  status: string;
  conclusion: string;
  detailsUrl: string | null;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: PullRequestState;
  url: string;
  author: PullRequestActor | null;
  baseBranch: string;
  headBranch: string;
  isDraft: boolean;
  reviewDecision: string;
  mergeStateStatus: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  labels: PullRequestLabel[];
  checks: PullRequestCheck[];
}

export interface PullRequestComment {
  id: string;
  author: PullRequestActor | null;
  body: string;
  createdAt: string;
  url: string | null;
}

export interface PullRequestReview {
  id: string;
  author: PullRequestActor | null;
  body: string;
  state: string;
  submittedAt: string;
}

export interface PullRequestCommit {
  oid: string;
  message: string;
  authoredAt: string;
  authors: PullRequestActor[];
}

export interface PullRequestFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string;
  mergeable: string;
  maintainerCanModify: boolean;
  comments: PullRequestComment[];
  reviews: PullRequestReview[];
  commits: PullRequestCommit[];
  files: PullRequestFile[];
}

export interface PullRequestDiff {
  patch: string;
  truncated: boolean;
}

export type PullRequestReviewEvent = "approve" | "comment" | "request_changes";

export type PullRequestMergeMethod = "merge" | "squash" | "rebase";
