import type {
  ProviderAuthStatus,
  ProviderInfo,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  RuntimeMode,
} from "./providers/contracts.js";
import type {
  CreateThreadParams,
  ThreadActivity,
  ThreadStatus,
  UpdateThreadParams,
} from "./services/threads.js";
import type { CreateRepoParams, UpdateRepoParams } from "./services/repositories.js";
import type { PlanStatus, PlanTask, PlanTaskStatus } from "./services/plans.js";
import type {
  CreateRepoProposalParams,
  UpdateRepoProposalParams,
} from "./services/repo-proposals.js";
import type {
  CreateJaitTodoRequest,
  CreateRepoRequest,
  CreateThreadParams as SharedCreateThreadParams,
  PlanStatus as SharedPlanStatus,
  PlanTask as SharedPlanTask,
  PlanTaskStatus as SharedPlanTaskStatus,
  ProviderAuthStatus as SharedProviderAuthStatus,
  ProviderInfo as SharedProviderInfo,
  ProviderLoginResult as SharedProviderLoginResult,
  ProviderLogoutResult as SharedProviderLogoutResult,
  ProviderModelInfo as SharedProviderModelInfo,
  RuntimeMode as SharedRuntimeMode,
  ThreadActivity as SharedThreadActivity,
  ThreadStatus as SharedThreadStatus,
  UpdateJaitTodoRequest,
  UpdateRepoRequest as SharedUpdateRepoRequest,
  UpdateThreadParams as SharedUpdateThreadParams,
} from "@jait/shared/types";

type IsEqual<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type Assert<T extends true> = T;

export type GatewayApiContractAssertions = [
  Assert<IsEqual<ProviderInfo, SharedProviderInfo>>,
  Assert<IsEqual<ProviderAuthStatus, SharedProviderAuthStatus>>,
  Assert<IsEqual<ProviderLoginResult, SharedProviderLoginResult>>,
  Assert<IsEqual<ProviderLogoutResult, SharedProviderLogoutResult>>,
  Assert<IsEqual<ProviderModelInfo, SharedProviderModelInfo>>,
  Assert<IsEqual<RuntimeMode, SharedRuntimeMode>>,
  Assert<IsEqual<ThreadStatus, SharedThreadStatus>>,
  Assert<IsEqual<ThreadActivity, SharedThreadActivity>>,
  Assert<IsEqual<CreateThreadParams, SharedCreateThreadParams>>,
  Assert<IsEqual<UpdateThreadParams, SharedUpdateThreadParams>>,
  Assert<IsEqual<PlanStatus, SharedPlanStatus>>,
  Assert<IsEqual<PlanTaskStatus, SharedPlanTaskStatus>>,
  Assert<IsEqual<PlanTask, SharedPlanTask>>,
  Assert<IsEqual<Omit<CreateRepoParams, "userId">, CreateRepoRequest>>,
  Assert<IsEqual<UpdateRepoParams, SharedUpdateRepoRequest>>,
  Assert<IsEqual<Omit<CreateRepoProposalParams, "repoId" | "userId">, CreateJaitTodoRequest>>,
  Assert<IsEqual<UpdateRepoProposalParams, UpdateJaitTodoRequest>>,
];
