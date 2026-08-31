import type {
  EventSource,
  HostId,
  JsonObject,
  JsonValue,
  Page,
  RequestOptions,
  Timestamp,
} from "./core.js";
import type { ThreadLocator } from "./identifiers.js";
import type { ThreadGoal } from "./threads.js";

export type BrowserSessionId = string;
export type BrowserTabId = string;

export interface BrowserTab {
  readonly id: BrowserTabId;
  readonly sessionId: BrowserSessionId;
  readonly thread?: ThreadLocator;
  readonly title: string;
  readonly url: string;
  readonly loading: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly active: boolean;
}

export type BrowserEvent =
  | { readonly type: "opened" | "changed"; readonly tab: BrowserTab }
  | { readonly type: "closed"; readonly tabId: BrowserTabId };

export interface BrowserSnapshot {
  readonly tabs: readonly BrowserTab[];
  readonly activeTabId: BrowserTabId | null;
}

export interface BrowserApi {
  listTabs(options?: RequestOptions): Promise<readonly BrowserTab[]>;
  open(
    input: { readonly url?: string; readonly thread?: ThreadLocator },
    options?: RequestOptions,
  ): Promise<BrowserTab>;
  navigate(tabId: BrowserTabId, url: string, options?: RequestOptions): Promise<void>;
  back(tabId: BrowserTabId, options?: RequestOptions): Promise<void>;
  forward(tabId: BrowserTabId, options?: RequestOptions): Promise<void>;
  reload(tabId: BrowserTabId, options?: RequestOptions): Promise<void>;
  close(tabId: BrowserTabId, options?: RequestOptions): Promise<void>;
  readonly events: EventSource<BrowserEvent, BrowserSnapshot>;
}

export type TerminalId = string;

export interface TerminalSession {
  readonly id: TerminalId;
  readonly hostId: HostId;
  readonly thread?: ThreadLocator;
  readonly cwd: string;
  readonly shell: string;
  readonly state: "starting" | "running" | "exited" | "failed";
  readonly exitCode?: number;
}

export type TerminalEvent =
  | { readonly type: "changed"; readonly terminal: TerminalSession }
  | {
      readonly type: "output";
      readonly terminalId: TerminalId;
      readonly stream: "stdout" | "stderr";
      readonly data: string;
    };

export interface TerminalSnapshot {
  readonly terminals: readonly TerminalSession[];
}

export interface TerminalsApi {
  list(options?: RequestOptions): Promise<readonly TerminalSession[]>;
  create(
    input: {
      readonly hostId: HostId;
      readonly thread?: ThreadLocator;
      readonly cwd?: string;
      readonly columns?: number;
      readonly rows?: number;
    },
    options?: RequestOptions,
  ): Promise<TerminalSession>;
  write(terminalId: TerminalId, data: string, options?: RequestOptions): Promise<void>;
  resize(
    terminalId: TerminalId,
    columns: number,
    rows: number,
    options?: RequestOptions,
  ): Promise<void>;
  close(terminalId: TerminalId, options?: RequestOptions): Promise<void>;
  readonly events: EventSource<TerminalEvent, TerminalSnapshot>;
}

export interface ThreadSource {
  readonly id: string;
  readonly kind: "web" | "file" | "app" | "connector" | "other";
  readonly title: string;
  readonly url?: string;
  readonly path?: string;
  readonly citationText?: string;
}

export interface SourcesApi {
  list(
    thread: ThreadLocator,
    options?: RequestOptions & { readonly cursor?: string; readonly limit?: number },
  ): Promise<Page<ThreadSource>>;
}

export interface GoalsApi {
  get(thread: ThreadLocator, options?: RequestOptions): Promise<ThreadGoal | null>;
  set(thread: ThreadLocator, text: string, options?: RequestOptions): Promise<ThreadGoal>;
  clear(thread: ThreadLocator, options?: RequestOptions): Promise<void>;
}

export interface ThreadDigest {
  readonly thread: ThreadLocator;
  readonly title: string;
  readonly summary: string;
  readonly generatedAt?: Timestamp;
}

export interface ThreadSummariesApi {
  get(thread: ThreadLocator, options?: RequestOptions): Promise<ThreadDigest | null>;
  generate(thread: ThreadLocator, options?: RequestOptions): Promise<ThreadDigest>;
}

export interface Subagent {
  readonly thread: ThreadLocator;
  readonly parentThread: ThreadLocator;
  readonly name?: string;
  readonly task?: string;
  readonly state: "starting" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  readonly startedAt?: Timestamp;
  readonly completedAt?: Timestamp;
}

export interface SubagentsApi {
  list(parentThread: ThreadLocator, options?: RequestOptions): Promise<readonly Subagent[]>;
  open(thread: ThreadLocator, options?: RequestOptions): Promise<void>;
}

export interface Artifact {
  readonly id: string;
  readonly thread?: ThreadLocator;
  readonly kind:
    | "external-resource"
    | "file"
    | "generated-image"
    | "google-drive"
    | "appgen-app"
    | "website";
  readonly title: string;
  readonly path?: string;
  readonly url?: string;
  readonly mediaType?: string;
  readonly createdAt?: Timestamp;
}

export interface ArtifactsApi {
  list(
    options?: RequestOptions & {
      readonly thread?: ThreadLocator;
      readonly cursor?: string;
      readonly limit?: number;
    },
  ): Promise<Page<Artifact>>;
  get(artifactId: string, options?: RequestOptions): Promise<Artifact>;
  open(artifactId: string, options?: RequestOptions): Promise<void>;
}

export interface McpServer {
  readonly ref: McpServerLocator;
  readonly name: string;
  readonly status: "connected" | "disconnected" | "auth-required" | "failed";
  readonly error?: string;
}

export interface McpServerLocator {
  readonly hostId: HostId;
  readonly serverId: string;
}

export interface McpTool {
  readonly server: McpServerLocator;
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: JsonObject;
}

export interface McpResource {
  readonly server: McpServerLocator;
  readonly uri: string;
  readonly name?: string;
  readonly description?: string;
  readonly mediaType?: string;
}

export interface McpApi {
  listServers(hostId: HostId, options?: RequestOptions): Promise<readonly McpServer[]>;
  listTools(server: McpServerLocator, options?: RequestOptions): Promise<readonly McpTool[]>;
  listResources(server: McpServerLocator, options?: RequestOptions): Promise<readonly McpResource[]>;
  callTool(
    server: McpServerLocator,
    toolName: string,
    input: JsonValue,
    options?: RequestOptions,
  ): Promise<JsonValue>;
  readResource(
    server: McpServerLocator,
    uri: string,
    options?: RequestOptions,
  ): Promise<{ readonly mediaType?: string; readonly data: JsonValue }>;
  startLogin(server: McpServerLocator, options?: RequestOptions): Promise<void>;
}
