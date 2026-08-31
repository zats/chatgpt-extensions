import type { RuntimeApi } from "./core.js";
import type { AppearanceApi } from "./appearance.js";
import type { ContributionsApi } from "./contributions.js";
import type {
  AccountsApi,
  AppsApi,
  AutomationsApi,
  CloudWorkspacesApi,
  ExecutionContextsApi,
  FilesApi,
  ModelsApi,
  PluginsApi,
  ProjectsApi,
  PullRequestsApi,
  ReviewApi,
  SkillsApi,
} from "./features.js";
import type { ComposerApi, MessagesApi } from "./messages.js";
import type { AssistantSelectionsApi } from "./selections.js";
import type {
  ArtifactsApi,
  BrowserApi,
  GoalsApi,
  McpApi,
  SourcesApi,
  SubagentsApi,
  TerminalsApi,
  ThreadSummariesApi,
} from "./services.js";
import type { SettingsApi } from "./settings.js";
import type { CommandsApi, NavigationApi, SidebarApi } from "./shell.js";
import type { DesktopNotificationsApi, ToastsApi } from "./status.js";
import type { SurfacesApi } from "./surfaces.js";
import type { ThreadsApi } from "./threads.js";

export interface ChatGPTXApi {
  readonly runtime: RuntimeApi;
  readonly appearance: AppearanceApi;
  readonly accounts: AccountsApi;
  readonly cloudWorkspaces: CloudWorkspacesApi;
  readonly executionContexts: ExecutionContextsApi;
  readonly threads: ThreadsApi;
  readonly messages: MessagesApi;
  readonly composer: ComposerApi;
  readonly selections: AssistantSelectionsApi;
  readonly contributions: ContributionsApi;
  readonly projects: ProjectsApi;
  readonly surfaces: SurfacesApi;
  readonly settings: SettingsApi;
  readonly commands: CommandsApi;
  readonly navigation: NavigationApi;
  readonly sidebar: SidebarApi;
  readonly toasts: ToastsApi;
  readonly notifications: DesktopNotificationsApi;
  readonly files: FilesApi;
  readonly models: ModelsApi;
  readonly review: ReviewApi;
  readonly pullRequests: PullRequestsApi;
  readonly automations: AutomationsApi;
  readonly plugins: PluginsApi;
  readonly skills: SkillsApi;
  readonly apps: AppsApi;
  readonly browser: BrowserApi;
  readonly terminals: TerminalsApi;
  readonly sources: SourcesApi;
  readonly goals: GoalsApi;
  readonly threadSummaries: ThreadSummariesApi;
  readonly subagents: SubagentsApi;
  readonly artifacts: ArtifactsApi;
  readonly mcp: McpApi;
}
