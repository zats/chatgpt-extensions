import type {
  AccountId,
  CloudWorkspaceId,
  EventSource,
  HostId,
  JsonObject,
  JsonValue,
  Page,
  RequestOptions,
  Timestamp,
} from "./core.js";
import type {
  ProjectLocator,
  ThreadLocator,
} from "./identifiers.js";

export interface Account {
  readonly id: AccountId;
  readonly hostId: HostId;
  readonly email?: string;
  readonly name?: string;
  readonly imageUrl?: string;
  readonly plan?: string;
}

export interface LoginFlow {
  readonly id: string;
  readonly hostId: HostId;
  readonly state: "pending" | "complete" | "cancelled" | "failed";
}

export interface RateLimitWindow {
  readonly name: string;
  readonly usedPercent?: number;
  readonly remaining?: number;
  readonly resetsAt?: Timestamp;
}

export interface RateLimitSnapshot {
  readonly hostId: HostId;
  readonly accountId: AccountId;
  readonly windows: readonly RateLimitWindow[];
  readonly resetCredits?: number;
}

export interface AccountTokenUsageOptions extends RequestOptions {
  /** Read estimated usage for one thread instead of account-wide activity. */
  readonly threadId?: string;
}

export interface AccountTokenUsageSummary {
  readonly lifetimeTokens: bigint | null;
  readonly peakDailyTokens: bigint | null;
  readonly longestRunningTurnSec: bigint | null;
  readonly currentStreakDays: bigint | null;
  readonly longestStreakDays: bigint | null;
}

export interface AccountTokenUsageDailyBucket {
  readonly startDate: string;
  readonly tokens: bigint;
}

export interface AccountThreadTokenUsageBreakdownGroup {
  readonly model: string | null;
  readonly reasoningEffort: string | null;
  readonly speed: string | null;
  readonly estimatedUsageCreditsMicros: bigint;
  readonly netNewInputTokens: bigint | null;
  readonly cachedInputTokens: bigint | null;
  readonly inputTokens: bigint | null;
  readonly outputTokens: bigint | null;
  readonly totalTokens: bigint | null;
}

export interface AccountThreadTokenUsage {
  readonly threadId: string;
  readonly estimatedUsageCreditsMicros: bigint;
  readonly estimatedUsageUsdMicros: bigint | null;
  readonly groups: readonly AccountThreadTokenUsageBreakdownGroup[];
}

export interface AccountTokenUsageSnapshot {
  readonly hostId: HostId;
  readonly summary: AccountTokenUsageSummary;
  readonly dailyUsageBuckets: readonly AccountTokenUsageDailyBucket[] | null;
  readonly threadUsage?: AccountThreadTokenUsage | null;
}

export type AccountEvent =
  | { readonly type: "changed"; readonly account: Account | null }
  | { readonly type: "login-completed"; readonly flowId: string }
  | { readonly type: "rate-limits-changed"; readonly rateLimits: RateLimitSnapshot };

export interface AccountSnapshot {
  readonly hostId: HostId;
  readonly current: Account | null;
  readonly rateLimits?: RateLimitSnapshot;
}

export interface AccountsApi {
  getCurrent(hostId: HostId, options?: RequestOptions): Promise<Account | null>;
  startLogin(hostId: HostId, options?: RequestOptions): Promise<LoginFlow>;
  cancelLogin(hostId: HostId, flowId: string, options?: RequestOptions): Promise<void>;
  logout(hostId: HostId, options?: RequestOptions): Promise<void>;
  getRateLimits(hostId: HostId, options?: RequestOptions): Promise<RateLimitSnapshot>;
  getUsage(
    hostId: HostId,
    options?: AccountTokenUsageOptions,
  ): Promise<AccountTokenUsageSnapshot>;
  consumeUsageReset(
    hostId: HostId,
    idempotencyKey: string,
    options?: RequestOptions,
  ): Promise<UsageResetResult>;
  events(hostId: HostId): EventSource<AccountEvent, AccountSnapshot>;
}

export interface UsageResetResult {
  readonly outcome:
    | "reset"
    | "already-redeemed"
    | "no-credit"
    | "nothing-to-reset"
    | "failed";
  readonly rateLimits?: RateLimitSnapshot;
}

export interface CloudWorkspace {
  readonly id: CloudWorkspaceId;
  readonly accountId: AccountId;
  readonly name: string;
  readonly role?: string;
  readonly plan?: string;
}

export interface CloudWorkspacesApi {
  list(accountId: AccountId, options?: RequestOptions): Promise<readonly CloudWorkspace[]>;
  getCurrent(accountId: AccountId, options?: RequestOptions): Promise<CloudWorkspace | null>;
}

export interface ExecutionContext {
  readonly hostId: HostId;
  readonly roots: readonly string[];
  readonly cwd: string;
}

export interface ExecutionContextsApi {
  list(options?: RequestOptions): Promise<readonly ExecutionContext[]>;
  get(hostId: HostId, options?: RequestOptions): Promise<ExecutionContext>;
}

export interface ExecutionProject {
  readonly ref: Extract<ProjectLocator, { readonly scope: "execution" }>;
  readonly kind: "execution";
  readonly name: string;
  readonly roots: readonly string[];
  readonly order: number;
  readonly createdAt?: Timestamp;
  readonly updatedAt?: Timestamp;
  readonly appearance?: ProjectAppearance;
}

export interface CloudProject {
  readonly ref: Extract<ProjectLocator, { readonly scope: "cloud" }>;
  readonly kind: "cloud";
  readonly name: string;
  readonly description?: string;
  readonly pinned: boolean;
  readonly fileCount?: number;
  readonly createdAt?: Timestamp;
  readonly updatedAt?: Timestamp;
}

export type Project = ExecutionProject | CloudProject;

export interface ProjectAppearance {
  readonly icon?: string;
  readonly color?: string;
}

export type ProjectInput =
  | {
      readonly kind: "execution";
      readonly hostId: HostId;
      readonly name: string;
      readonly roots: readonly string[];
      readonly appearance?: ProjectAppearance;
    }
  | {
      readonly kind: "cloud";
      readonly accountId: AccountId;
      readonly workspaceId?: CloudWorkspaceId;
      readonly name: string;
      readonly description?: string;
    };

export interface ProjectListOptions extends RequestOptions {
  readonly cursor?: string;
  readonly limit?: number;
  readonly scope?:
    | { readonly kind: "host"; readonly hostId: HostId }
    | {
        readonly kind: "account";
        readonly accountId: AccountId;
        readonly workspaceId?: CloudWorkspaceId;
      };
}

export type ProjectEvent =
  | { readonly type: "created" | "changed" | "moved"; readonly project: Project }
  | { readonly type: "deleted"; readonly project: ProjectLocator };

export interface ProjectSnapshot {
  readonly revision: number;
  readonly projects: readonly Project[];
}

export interface ProjectsApi {
  list(options?: ProjectListOptions): Promise<Page<Project>>;
  get(project: ProjectLocator, options?: RequestOptions): Promise<Project>;
  create(input: ProjectInput, options?: RequestOptions): Promise<Project>;
  import(
    input: Extract<ProjectInput, { readonly kind: "execution" }> & { readonly source: string },
    options?: RequestOptions,
  ): Promise<ExecutionProject>;
  update(
    project: Extract<ProjectLocator, { readonly scope: "execution" }>,
    update: {
      readonly name?: string;
      readonly roots?: readonly string[];
      readonly appearance?: ProjectAppearance;
    },
    options?: RequestOptions,
  ): Promise<ExecutionProject>;
  update(
    project: Extract<ProjectLocator, { readonly scope: "cloud" }>,
    update: {
      readonly name?: string;
      readonly description?: string;
      readonly pinned?: boolean;
    },
    options?: RequestOptions,
  ): Promise<CloudProject>;
  move(
    project: Extract<ProjectLocator, { readonly scope: "execution" }>,
    beforeProject?: Extract<ProjectLocator, { readonly scope: "execution" }>,
    options?: RequestOptions,
  ): Promise<void>;
  delete(project: ProjectLocator, options?: RequestOptions): Promise<void>;
  readonly events: EventSource<ProjectEvent, ProjectSnapshot>;
}

export interface FileReference {
  /** An app file handle. Direct native extensions can also use a file path. */
  readonly id: string;
  readonly name: string;
  readonly path?: string;
  readonly mediaType?: string;
  readonly size?: number;
  readonly modifiedAt?: Timestamp;
}

export interface FilesApi {
  pick(
    options?: RequestOptions & {
      readonly multiple?: boolean;
      readonly directories?: boolean;
      readonly mediaTypes?: readonly string[];
    },
  ): Promise<readonly FileReference[]>;
  getMetadata(fileId: string, options?: RequestOptions): Promise<FileReference>;
  readText(fileId: string, options?: RequestOptions): Promise<string>;
  readBytes(fileId: string, options?: RequestOptions): Promise<Uint8Array>;
  writeText(fileId: string, text: string, options?: RequestOptions): Promise<void>;
  events(fileId: string): EventSource<FileReference, FileReference>;
}

export interface ModelDescriptor {
  readonly scope: ModelScope;
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly description?: string;
  readonly reasoningEfforts?: readonly string[];
  readonly inputTypes: readonly ("text" | "image" | "file" | "audio")[];
  readonly capabilities: readonly string[];
}

export type ModelScope =
  | { readonly kind: "host"; readonly hostId: HostId }
  | {
      readonly kind: "account";
      readonly accountId: AccountId;
      readonly workspaceId?: CloudWorkspaceId;
    };

export interface ModelsApi {
  list(scope: ModelScope, options?: RequestOptions): Promise<readonly ModelDescriptor[]>;
  get(scope: ModelScope, modelId: string, options?: RequestOptions): Promise<ModelDescriptor>;
}

export interface DiffFile {
  readonly path: string;
  readonly previousPath?: string;
  readonly status: "added" | "deleted" | "modified" | "renamed" | "untracked";
  readonly patch?: string;
  readonly sections: readonly DiffSection[];
}

export interface DiffHunk {
  readonly index: number;
  readonly patch: string;
  readonly staged?: boolean;
}

export interface DiffSection {
  readonly index: number;
  readonly title?: string;
  readonly hunks: readonly DiffHunk[];
}

export interface ReviewResult {
  readonly id: string;
  readonly thread?: ThreadLocator;
  readonly files: readonly DiffFile[];
  readonly summary?: string;
}

export type ReviewSource =
  | { readonly kind: "last-turn" }
  | { readonly kind: "branch"; readonly baseBranch?: string }
  | { readonly kind: "uncommitted" }
  | { readonly kind: "unstaged" }
  | { readonly kind: "staged" }
  | { readonly kind: "commit"; readonly revision: string };

export type ReviewSelection =
  | { readonly kind: "all" }
  | { readonly kind: "section"; readonly path: string; readonly sectionIndex: number }
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "hunk"; readonly path: string; readonly hunkIndex: number };

export interface ReviewApi {
  start(
    input: { readonly thread?: ThreadLocator; readonly source: ReviewSource },
    options?: RequestOptions,
  ): Promise<ReviewResult>;
  get(reviewId: string, options?: RequestOptions): Promise<ReviewResult>;
  stage(reviewId: string, selection: ReviewSelection, options?: RequestOptions): Promise<void>;
  unstage(reviewId: string, selection: ReviewSelection, options?: RequestOptions): Promise<void>;
  revert(reviewId: string, selection: ReviewSelection, options?: RequestOptions): Promise<void>;
}

export interface PullRequest {
  readonly id: string;
  readonly host: string;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed" | "merged";
  readonly isDraft: boolean;
  readonly headBranch?: string;
  readonly baseBranch?: string;
}

export interface PullRequestsApi {
  list(
    options?: RequestOptions & {
      readonly project?: ProjectLocator;
      readonly cursor?: string;
      readonly limit?: number;
    },
  ): Promise<Page<PullRequest>>;
  get(id: string, options?: RequestOptions): Promise<PullRequest>;
  open(id: string, options?: RequestOptions): Promise<void>;
  create(
    input: {
      readonly project: Extract<ProjectLocator, { readonly scope: "execution" }>;
      readonly title: string;
      readonly body?: string;
      readonly draft?: boolean;
      readonly baseBranch?: string;
    },
    options?: RequestOptions,
  ): Promise<PullRequest>;
}

export type AutomationTarget =
  | { readonly kind: "thread"; readonly thread: ThreadLocator }
  | { readonly kind: "project"; readonly project: ProjectLocator }
  | { readonly kind: "standalone"; readonly hostId?: HostId };

export interface AutomationSchedule {
  readonly rrule: string;
  readonly timezone: string;
}

export interface AutomationExecution {
  readonly modelId?: string;
  readonly workingDirectories?: readonly string[];
  readonly environment?: JsonObject;
}

export interface Automation {
  readonly id: string;
  readonly kind: "cron" | "heartbeat";
  readonly name: string;
  readonly prompt: string;
  readonly status: "active" | "paused" | "deleted";
  readonly location: "local" | "cloud";
  readonly target: AutomationTarget;
  readonly schedule: AutomationSchedule;
  readonly execution?: AutomationExecution;
  readonly notificationPolicy?: "all-runs" | "failed-runs-only" | "none";
  readonly pluginTemplateId?: string;
  readonly nextRunAt?: Timestamp;
  readonly lastRunAt?: Timestamp;
}

export interface AutomationRun {
  readonly id: string;
  readonly automationId: string;
  readonly status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  readonly startedAt?: Timestamp;
  readonly completedAt?: Timestamp;
  readonly thread?: ThreadLocator;
  readonly error?: string;
}

export type AutomationInput = Omit<
  Automation,
  "id" | "nextRunAt" | "lastRunAt"
>;

export interface AutomationsApi {
  list(options?: RequestOptions): Promise<readonly Automation[]>;
  get(automationId: string, options?: RequestOptions): Promise<Automation>;
  create(input: AutomationInput, options?: RequestOptions): Promise<Automation>;
  update(
    automationId: string,
    input: AutomationInput,
    options?: RequestOptions,
  ): Promise<Automation>;
  delete(automationId: string, options?: RequestOptions): Promise<void>;
  setStatus(
    automationId: string,
    status: "active" | "paused",
    options?: RequestOptions,
  ): Promise<void>;
  run(automationId: string, options?: RequestOptions): Promise<AutomationRun>;
  listRuns(
    automationId: string,
    options?: RequestOptions & { readonly cursor?: string; readonly limit?: number },
  ): Promise<Page<AutomationRun>>;
}

export interface PluginSummary {
  readonly ref: PluginLocator;
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly installed: boolean;
  readonly enabled: boolean;
  readonly shared: boolean;
}

export interface PluginLocator {
  readonly hostId: HostId;
  readonly pluginId: string;
}

export interface PluginsApi {
  list(hostId: HostId, options?: RequestOptions): Promise<readonly PluginSummary[]>;
  search(hostId: HostId, query: string, options?: RequestOptions): Promise<readonly PluginSummary[]>;
  get(plugin: PluginLocator, options?: RequestOptions): Promise<PluginSummary>;
  install(plugin: PluginLocator, options?: RequestOptions): Promise<PluginSummary>;
  uninstall(plugin: PluginLocator, options?: RequestOptions): Promise<void>;
  setEnabled(plugin: PluginLocator, enabled: boolean, options?: RequestOptions): Promise<void>;
}

export interface SkillSummary {
  readonly ref: SkillLocator;
  readonly name: string;
  readonly description?: string;
  readonly source: string;
  readonly enabled: boolean;
}

export interface SkillLocator {
  readonly hostId: HostId;
  readonly skillId: string;
}

export interface SkillsApi {
  list(hostId: HostId, options?: RequestOptions): Promise<readonly SkillSummary[]>;
  get(skill: SkillLocator, options?: RequestOptions): Promise<SkillSummary>;
  setEnabled(skill: SkillLocator, enabled: boolean, options?: RequestOptions): Promise<void>;
  reload(hostId: HostId, options?: RequestOptions): Promise<void>;
}

export interface AppToolDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: JsonObject;
  readonly outputSchema?: JsonObject;
  readonly available: boolean;
}

export interface AppResourceDescriptor {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mediaType?: string;
  readonly available: boolean;
}

export interface AppDescriptor {
  readonly ref: AppLocator;
  readonly name: string;
  readonly description?: string;
  readonly installed: boolean;
  readonly tools: readonly AppToolDescriptor[];
  readonly resources: readonly AppResourceDescriptor[];
}

export interface AppLocator {
  readonly hostId: HostId;
  readonly appId: string;
}

export interface AppsApi {
  list(hostId: HostId, options?: RequestOptions): Promise<readonly AppDescriptor[]>;
  get(app: AppLocator, options?: RequestOptions): Promise<AppDescriptor>;
  invoke(
    app: AppLocator,
    toolName: string,
    input: JsonValue,
    options?: RequestOptions,
  ): Promise<JsonValue>;
  readResource(
    app: AppLocator,
    uri: string,
    options?: RequestOptions,
  ): Promise<{ readonly mediaType?: string; readonly data: JsonValue }>;
}
