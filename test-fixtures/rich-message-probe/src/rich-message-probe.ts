import type {
  AssistantCodeBlockUiContext,
  AssistantContentReferenceUiContext,
  AssistantDirectiveUiContext,
  ContributionsApi,
  ConversationItemUiContext,
  Disposable,
  ExtensionStorageApi,
  JsonObject,
  JsonValue,
  ThreadLocator,
  UiMount,
  UiOwnerContext,
  UiRegistration,
  UiRenderProvider,
} from "@chatgptx/api";

export const PROBE_EVENT_FILE = "events.json";

export function richProbeEventFile(documentId: string): string {
  if (documentId.length === 0) {
    throw new TypeError("A Rich Message Probe document ID is required");
  }
  return `events/${encodeURIComponent(documentId)}.json`;
}
export const PROBE_DIRECTIVE_ID = "rich-message-probe.directive";
export const PROBE_CONTENT_REFERENCE_ID =
  "rich-message-probe.content-reference";
export const PROBE_CODE_BLOCK_ID = "rich-message-probe.code-block";
export const PROBE_CONVERSATION_ITEM_ID =
  "rich-message-probe.conversation-item";
export const PROBE_CLOUD_CONVERSATION_ITEM_ID =
  "rich-message-probe.cloud-conversation-item";
export const PROBE_TYPE = "chatgptx-probe";

const FALLBACK_OUTCOMES = Object.freeze([
  "nonMatch",
  "matcherError",
  "rendererError",
] as const);

export const PROBE_FALLBACK_DEFINITIONS = Object.freeze({
  assistantDirective: Object.freeze({
    id: "rich-message-probe.fallback.directive.renderer-error",
    value: "chatgptx-probe-directive-fallback",
    nativeOnlyValue: "chatgptx-probe-directive-unregistered",
  }),
  assistantContentReference: Object.freeze({
    id: "rich-message-probe.fallback.content-reference",
    value: "title_citation",
  }),
  assistantCodeBlock: Object.freeze({
    id: "rich-message-probe.fallback.code-block",
    value: "text",
  }),
  conversationItem: Object.freeze({
    id: "rich-message-probe.fallback.conversation-item",
    value: "assistant-message",
  }),
});

const PROBE_CONVERSATION_ID = "chatgptx-rich-probe";
const PROBE_TURN_ID = "chatgptx-rich-probe-turn";
const PROBE_TURN_MESSAGE_ID = "chatgptx-rich-probe-turn-message";
const PROBE_REFERENCE_MESSAGE_ID = "chatgptx-rich-probe-reference-message";
const PROBE_DIRECTIVE_INSTANCE_ID = "chatgptx-rich-probe-directive:0";
const PROBE_CONTAINER_DIRECTIVE_INSTANCE_ID =
  "chatgptx-rich-probe-directive-container:0";
const PROBE_ITEM_ID = "chatgptx-rich-probe-item";
const PROBE_GROUPED_ITEM_ID = "chatgptx-rich-probe-grouped-item";
const PROBE_CLOUD_CONVERSATION_ID = "chatgptx-rich-probe-cloud";
const PROBE_CLOUD_TURN_ID = "chatgptx-rich-probe-cloud-turn";
const PROBE_CLOUD_ITEM_ID = "chatgptx-rich-probe-cloud-item";

export type RichProbeSurface =
  | "directive"
  | "directive-container"
  | "content-reference"
  | "code-block"
  | "code-block-streaming"
  | "conversation-item"
  | "conversation-item-grouped"
  | "conversation-item-cloud";

export type RichProbeEventName =
  | "extension.activate"
  | "extension.dispose"
  | `${RichProbeSurface}.mount`
  | `${RichProbeSurface}.invalidate`
  | `${RichProbeSurface}.activate`
  | `${RichProbeSurface}.dispose`;

export interface RichProbeEvent {
  readonly sequence: number;
  readonly name: RichProbeEventName;
  /** Exact public context received when a successful owner mounted. */
  readonly context?: RichProbeContextEvidence;
}

export interface RichProbeContextEvidence extends JsonObject {
  readonly surface: RichProbeSurface;
  readonly ownerId: string;
  readonly windowId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly hostId: string;
  readonly scope: "execution" | "cloud";
  readonly accountId?: string;
  readonly thread: ThreadLocator;
  readonly value: JsonObject;
}

export interface RichMessageProbeContext {
  readonly api: { readonly contributions: ContributionsApi };
  readonly storage: ExtensionStorageApi;
  readonly lifetime: AbortSignal;
}

export interface RichMessageProbeHandle extends Disposable {
  /** Wait until every storage event requested before this call is durable. */
  flush(): Promise<void>;
}

const SURFACES: readonly RichProbeSurface[] = Object.freeze([
  "directive",
  "directive-container",
  "content-reference",
  "code-block",
  "code-block-streaming",
  "conversation-item",
  "conversation-item-grouped",
  "conversation-item-cloud",
]);

const SURFACE_LABELS: Readonly<Record<RichProbeSurface, string>> =
  Object.freeze({
    directive: "directive",
    "directive-container": "container directive",
    "content-reference": "content reference",
    "code-block": "code block",
    "code-block-streaming": "streaming code block",
    "conversation-item": "conversation item",
    "conversation-item-grouped": "grouped conversation item",
    "conversation-item-cloud": "cloud conversation item",
  });

const EVENT_NAMES = new Set<RichProbeEventName>([
  "extension.activate",
  "extension.dispose",
  ...SURFACES.flatMap((surface) => [
    `${surface}.mount` as const,
    `${surface}.invalidate` as const,
    `${surface}.activate` as const,
    `${surface}.dispose` as const,
  ]),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isRichProbeContextEvidence(
  value: unknown,
): value is RichProbeContextEvidence {
  if (!isRecord(value)) return false;
  const cloud = value.surface === "conversation-item-cloud";
  const validThread = isRecord(value.thread) &&
    (cloud
      ? value.thread.scope === "cloud" &&
        value.thread.accountId === value.accountId &&
        value.thread.threadId === PROBE_CLOUD_CONVERSATION_ID &&
        (value.thread.workspaceId === undefined ||
          typeof value.thread.workspaceId === "string")
      : value.thread.scope === "execution" &&
        value.thread.hostId === "local" &&
        value.thread.threadId === PROBE_CONVERSATION_ID);
  return (
    SURFACES.includes(value.surface as RichProbeSurface) &&
    typeof value.ownerId === "string" &&
    typeof value.windowId === "string" &&
    value.conversationId ===
      (cloud ? PROBE_CLOUD_CONVERSATION_ID : PROBE_CONVERSATION_ID) &&
    value.turnId === (cloud ? PROBE_CLOUD_TURN_ID : PROBE_TURN_ID) &&
    value.hostId === (cloud ? "cloud" : "local") &&
    value.scope === (cloud ? "cloud" : "execution") &&
    (!cloud || (typeof value.accountId === "string" && value.accountId.length > 0)) &&
    validThread &&
    isRecord(value.value) &&
    isJsonValue(value.value)
  );
}

export function parseRichProbeEventLog(
  contents: string | undefined,
): RichProbeEvent[] {
  if (contents === undefined) return [];
  const value: unknown = JSON.parse(contents);
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new TypeError("Rich Message Probe storage is not an event log");
  }
  return value.events.map((event, index) => {
    const eventName = isRecord(event) && typeof event.name === "string"
      ? event.name
      : "";
    const needsContext = eventName.endsWith(".mount");
    if (
      !isRecord(event) ||
      event.sequence !== index + 1 ||
      typeof event.name !== "string" ||
      !EVENT_NAMES.has(event.name as RichProbeEventName) ||
      needsContext !== (event.context !== undefined) ||
      (event.context !== undefined &&
        !isRichProbeContextEvidence(event.context))
    ) {
      throw new TypeError("Rich Message Probe storage contains an invalid event");
    }
    return Object.freeze({
      sequence: event.sequence,
      name: event.name as RichProbeEventName,
      ...(event.context === undefined
        ? {}
        : { context: event.context }),
    });
  });
}

export function serializeRichProbeEventLog(
  events: readonly RichProbeEvent[],
): string {
  return `${JSON.stringify({ events }, null, 2)}\n`;
}

export class RichProbeEventRecorder {
  readonly #storage: ExtensionStorageApi;
  readonly #file: string;
  readonly #events: RichProbeEvent[];
  #write: Promise<void> = Promise.resolve();

  constructor(
    storage: ExtensionStorageApi,
    events: readonly RichProbeEvent[] = [],
    file = PROBE_EVENT_FILE,
  ) {
    this.#storage = storage;
    this.#events = [...events];
    this.#file = file;
  }

  count(name: RichProbeEventName): number {
    return this.#events.reduce(
      (count, event) => count + (event.name === name ? 1 : 0),
      0,
    );
  }

  record(
    name: RichProbeEventName,
    context?: RichProbeContextEvidence,
  ): Promise<void> {
    this.#events.push(
      Object.freeze({
        sequence: this.#events.length + 1,
        name,
        ...(context === undefined ? {} : { context }),
      }),
    );
    const contents = serializeRichProbeEventLog(this.#events);
    const write = this.#write.then(() =>
      this.#storage.writeTextFile(this.#file, contents),
    );
    this.#write = write;
    void write.catch(() => undefined);
    return write;
  }

  flush(): Promise<void> {
    return this.#write;
  }
}

function failContext(surface: RichProbeSurface, detail: string): never {
  throw new TypeError(`Rich probe ${surface} context is invalid: ${detail}`);
}

function assertString(
  surface: RichProbeSurface,
  label: string,
  actual: string | undefined,
  expected: string,
): void {
  if (actual !== expected) {
    failContext(surface, `${label} must equal ${JSON.stringify(expected)}`);
  }
}

function stableJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as JsonObject)[key] ?? null)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertJson(
  surface: RichProbeSurface,
  label: string,
  actual: JsonValue,
  expected: JsonValue,
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    failContext(surface, `${label} has unexpected JSON data`);
  }
}

function assertDeepFrozen(
  surface: RichProbeSurface,
  label: string,
  value: JsonValue,
): void {
  if (value === null || typeof value !== "object") return;
  if (!Object.isFrozen(value)) {
    failContext(surface, `${label} must be deeply immutable`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertDeepFrozen(surface, `${label}[${index}]`, item),
    );
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assertDeepFrozen(surface, `${label}.${key}`, item);
  }
}

function assertOwnerContext(
  surface: RichProbeSurface,
  context: UiOwnerContext & {
    readonly conversationId: string;
    readonly turnId?: string;
    readonly hostId?: string;
  },
  expected: {
    readonly conversationId: string;
    readonly turnId: string;
    readonly hostId: string;
  } = {
    conversationId: PROBE_CONVERSATION_ID,
    turnId: PROBE_TURN_ID,
    hostId: "local",
  },
): void {
  if (!Object.isFrozen(context)) {
    failContext(surface, "the public context must be immutable");
  }
  if (context.ownerId.length === 0 || context.windowId.length === 0) {
    failContext(surface, "ownerId and windowId must be non-empty");
  }
  assertString(
    surface,
    "conversationId",
    context.conversationId,
    expected.conversationId,
  );
  assertString(surface, "turnId", context.turnId, expected.turnId);
  assertString(surface, "hostId", context.hostId, expected.hostId);
}

function evidence(
  surface: RichProbeSurface,
  context: UiOwnerContext & {
    readonly conversationId: string;
    readonly turnId?: string;
    readonly hostId?: string;
  },
  value: JsonObject,
  scope: "execution" | "cloud" = "execution",
  accountId?: string,
  thread: ThreadLocator = Object.freeze({
    scope: "execution",
    hostId: "local",
    threadId: PROBE_CONVERSATION_ID,
  }),
): RichProbeContextEvidence {
  return Object.freeze({
    surface,
    ownerId: context.ownerId,
    windowId: context.windowId,
    conversationId: context.conversationId,
    turnId: context.turnId ?? "",
    hostId: context.hostId ?? "",
    scope,
    ...(accountId === undefined ? {} : { accountId }),
    thread,
    value: Object.freeze(value),
  });
}

function assertAssistantThread(
  surface: RichProbeSurface,
  context: {
    readonly thread: ThreadLocator;
    readonly conversationId: string;
    readonly hostId?: string;
  },
): void {
  assertJson(surface, "thread", context.thread, {
    scope: "execution",
    hostId: "local",
    threadId: context.conversationId,
  });
  if (!Object.isFrozen(context.thread)) {
    failContext(surface, "thread must be immutable");
  }
}

function validateDirectiveContext(
  context: AssistantDirectiveUiContext,
): RichProbeContextEvidence {
  const surface = "directive";
  assertOwnerContext(surface, context);
  assertAssistantThread(surface, context);
  if (context.streaming) failContext(surface, "streaming must be false");
  assertString(surface, "messageId", context.messageId, PROBE_TURN_MESSAGE_ID);
  assertString(surface, "directive.name", context.directive.name, PROBE_TYPE);
  assertString(
    surface,
    "directive.directiveId",
    context.directive.directiveId,
    PROBE_DIRECTIVE_INSTANCE_ID,
  );
  assertJson(surface, "directive.attributes", context.directive.attributes, {
    token: "directive",
  });
  if (!context.directive.terminalInline) {
    failContext(surface, "directive.terminalInline must be true");
  }
  if (!Object.isFrozen(context.directive) || !Object.isFrozen(context.directive.attributes)) {
    failContext(surface, "directive data must be immutable");
  }
  if (
    context.directive.kind === "leaf" &&
    context.directive.content !== undefined
  ) {
    failContext(surface, "a leaf directive cannot have content");
  }
  if (
    context.directive.kind !== "leaf" &&
    typeof context.directive.content !== "string"
  ) {
    failContext(surface, "a container directive must have string content");
  }
  return evidence(surface, context, {
    streaming: context.streaming,
    messageId: context.messageId ?? "",
    directive: {
      name: context.directive.name,
      kind: context.directive.kind,
      attributes: context.directive.attributes,
      directiveId: context.directive.directiveId ?? "",
      terminalInline: context.directive.terminalInline,
      ...(context.directive.content === undefined
        ? {}
        : { content: context.directive.content }),
    },
  });
}

function validateContainerDirectiveContext(
  context: AssistantDirectiveUiContext,
): RichProbeContextEvidence {
  const surface = "directive-container";
  assertOwnerContext(surface, context);
  assertAssistantThread(surface, context);
  if (context.streaming) failContext(surface, "streaming must be false");
  assertString(surface, "messageId", context.messageId, PROBE_TURN_MESSAGE_ID);
  assertString(surface, "directive.name", context.directive.name, PROBE_TYPE);
  assertString(
    surface,
    "directive.directiveId",
    context.directive.directiveId,
    PROBE_CONTAINER_DIRECTIVE_INSTANCE_ID,
  );
  assertJson(surface, "directive.attributes", context.directive.attributes, {
    token: "directive-container",
  });
  if (
    context.directive.kind !== "container" ||
    context.directive.terminalInline ||
    context.directive.content !== "Container directive content"
  ) {
    failContext(surface, "container directive fields are incorrect");
  }
  if (
    !Object.isFrozen(context.directive) ||
    !Object.isFrozen(context.directive.attributes)
  ) {
    failContext(surface, "directive data must be immutable");
  }
  return evidence(surface, context, {
    streaming: context.streaming,
    messageId: context.messageId ?? "",
    directive: {
      name: context.directive.name,
      kind: context.directive.kind,
      attributes: context.directive.attributes,
      directiveId: context.directive.directiveId ?? "",
      terminalInline: context.directive.terminalInline,
      content: context.directive.content,
    },
  });
}

function validateContentReferenceContext(
  context: AssistantContentReferenceUiContext,
): RichProbeContextEvidence {
  const surface = "content-reference";
  assertOwnerContext(surface, context);
  assertAssistantThread(surface, context);
  if (context.streaming) failContext(surface, "streaming must be false");
  assertString(
    surface,
    "messageId",
    context.messageId,
    PROBE_REFERENCE_MESSAGE_ID,
  );
  assertString(surface, "reference.type", context.reference.type, PROBE_TYPE);
  assertJson(surface, "reference.data", context.reference.data, {
    type: PROBE_TYPE,
    token: "reference",
    nested: { value: 42 },
    values: [{ label: "deep" }],
  });
  if (context.index !== 0) failContext(surface, "index must equal 0");
  if (!Object.isFrozen(context.reference)) {
    failContext(surface, "reference data must be immutable");
  }
  assertDeepFrozen(surface, "reference.data", context.reference.data);
  return evidence(surface, context, {
    streaming: context.streaming,
    messageId: context.messageId ?? "",
    reference: {
      type: context.reference.type,
      data: context.reference.data,
    },
    index: context.index,
    terminalInline: context.terminalInline,
  });
}

function validateCodeBlockContext(
  context: AssistantCodeBlockUiContext,
): RichProbeContextEvidence {
  const surface = "code-block";
  assertOwnerContext(surface, context);
  assertAssistantThread(surface, context);
  if (context.streaming) failContext(surface, "streaming must be false");
  assertString(surface, "messageId", context.messageId, PROBE_TURN_MESSAGE_ID);
  const block = context.codeBlock;
  if (block.index !== 0) failContext(surface, "codeBlock.index must equal 0");
  assertString(surface, "codeBlock.language", block.language, PROBE_TYPE);
  assertString(
    surface,
    "codeBlock.content",
    block.content,
    '{"token":"code"}',
  );
  if (block.fenceOpen) failContext(surface, "codeBlock.fenceOpen must be false");
  assertString(surface, "codeBlock.info", block.info, PROBE_TYPE);
  if (!Object.isFrozen(block)) {
    failContext(surface, "code-block data must be immutable");
  }
  return evidence(surface, context, {
    streaming: context.streaming,
    messageId: context.messageId ?? "",
    codeBlock: {
      index: block.index,
      language: block.language ?? "",
      content: block.content,
      fenceOpen: block.fenceOpen,
      info: block.info ?? "",
    },
  });
}

function validateStreamingCodeBlockContext(
  context: AssistantCodeBlockUiContext,
): RichProbeContextEvidence {
  const surface = "code-block-streaming";
  assertOwnerContext(surface, context);
  assertAssistantThread(surface, context);
  if (!context.streaming) failContext(surface, "streaming must be true");
  assertString(surface, "messageId", context.messageId, PROBE_TURN_MESSAGE_ID);
  const block = context.codeBlock;
  if (block.index !== 1) failContext(surface, "codeBlock.index must equal 1");
  assertString(surface, "codeBlock.language", block.language, PROBE_TYPE);
  assertString(
    surface,
    "codeBlock.content",
    block.content,
    '{"token":"streaming"}',
  );
  if (!block.fenceOpen) {
    failContext(surface, "codeBlock.fenceOpen must be true");
  }
  assertString(surface, "codeBlock.info", block.info, PROBE_TYPE);
  if (!Object.isFrozen(block)) {
    failContext(surface, "code-block data must be immutable");
  }
  return evidence(surface, context, {
    streaming: context.streaming,
    messageId: context.messageId ?? "",
    codeBlock: {
      index: block.index,
      language: block.language ?? "",
      content: block.content,
      fenceOpen: block.fenceOpen,
      info: block.info ?? "",
    },
  });
}

function validateConversationItemContext(
  context: ConversationItemUiContext,
): RichProbeContextEvidence {
  const surface = "conversation-item";
  assertOwnerContext(surface, context);
  if (context.layout !== "standalone") {
    failContext(surface, "layout must equal standalone");
  }
  const item = context.item;
  if (item.kind !== "opaque") failContext(surface, "item must be opaque");
  assertString(surface, "item.id", item.id, PROBE_ITEM_ID);
  assertString(surface, "item.turnId", item.turnId, PROBE_TURN_ID);
  assertString(surface, "item.sourceKind", item.sourceKind, PROBE_TYPE);
  assertString(surface, "item.label", item.label, PROBE_TYPE);
  if (item.status !== "complete" || item.presentationVersion !== 1) {
    failContext(surface, "item status or presentationVersion is incorrect");
  }
  assertJson(surface, "item.thread", item.thread, {
    scope: "execution",
    hostId: "local",
    threadId: PROBE_CONVERSATION_ID,
  });
  assertJson(surface, "item.data", item.data, {
    id: PROBE_ITEM_ID,
    type: PROBE_TYPE,
    token: "item",
    nested: { value: 42 },
    values: [{ label: "deep" }],
    status: "complete",
  });
  if (!Object.isFrozen(item) || !Object.isFrozen(item.thread)) {
    failContext(surface, "conversation-item data must be immutable");
  }
  assertDeepFrozen(surface, "item.data", item.data);
  return evidence(
    surface,
    context,
    {
      layout: context.layout,
      item: {
        id: item.id,
        turnId: item.turnId ?? "",
        status: item.status,
        kind: item.kind,
        sourceKind: item.sourceKind,
        data: item.data,
        presentationVersion: item.presentationVersion,
        label: item.label,
        thread: item.thread,
      },
    },
    "execution",
    undefined,
    item.thread,
  );
}

function validateGroupedConversationItemContext(
  context: ConversationItemUiContext,
): RichProbeContextEvidence {
  const surface = "conversation-item-grouped";
  assertOwnerContext(surface, context);
  if (context.layout !== "grouped") {
    failContext(surface, "layout must equal grouped");
  }
  const item = context.item;
  if (item.kind !== "opaque") failContext(surface, "item must be opaque");
  assertString(surface, "item.id", item.id, PROBE_GROUPED_ITEM_ID);
  assertString(surface, "item.turnId", item.turnId, PROBE_TURN_ID);
  assertString(surface, "item.sourceKind", item.sourceKind, PROBE_TYPE);
  assertString(surface, "item.label", item.label, PROBE_TYPE);
  if (item.status !== "complete" || item.presentationVersion !== 1) {
    failContext(surface, "item status or presentationVersion is incorrect");
  }
  assertJson(surface, "item.thread", item.thread, {
    scope: "execution",
    hostId: "local",
    threadId: PROBE_CONVERSATION_ID,
  });
  assertJson(surface, "item.data", item.data, {
    id: PROBE_GROUPED_ITEM_ID,
    type: PROBE_TYPE,
    token: "grouped-item",
    status: "complete",
  });
  if (!Object.isFrozen(item) || !Object.isFrozen(item.thread)) {
    failContext(surface, "conversation-item data must be immutable");
  }
  assertDeepFrozen(surface, "item.data", item.data);
  return evidence(
    surface,
    context,
    {
      layout: context.layout,
      item: {
        id: item.id,
        turnId: item.turnId ?? "",
        status: item.status,
        kind: item.kind,
        sourceKind: item.sourceKind,
        data: item.data,
        presentationVersion: item.presentationVersion,
        label: item.label,
        thread: item.thread,
      },
    },
    "execution",
    undefined,
    item.thread,
  );
}

function validateCloudConversationItemContext(
  context: ConversationItemUiContext,
): RichProbeContextEvidence {
  const surface = "conversation-item-cloud";
  assertOwnerContext(surface, context, {
    conversationId: PROBE_CLOUD_CONVERSATION_ID,
    turnId: PROBE_CLOUD_TURN_ID,
    hostId: "cloud",
  });
  if (context.layout !== "standalone") {
    failContext(surface, "layout must equal standalone");
  }
  const item = context.item;
  if (item.kind !== "opaque") failContext(surface, "item must be opaque");
  assertString(surface, "item.id", item.id, PROBE_CLOUD_ITEM_ID);
  assertString(surface, "item.turnId", item.turnId, PROBE_CLOUD_TURN_ID);
  assertString(surface, "item.sourceKind", item.sourceKind, PROBE_TYPE);
  assertString(surface, "item.label", item.label, PROBE_TYPE);
  if (item.status !== "complete" || item.presentationVersion !== 1) {
    failContext(surface, "item status or presentationVersion is incorrect");
  }
  if (
    item.thread.scope !== "cloud" ||
    typeof item.thread.accountId !== "string" ||
    item.thread.accountId.length === 0 ||
    item.thread.threadId !== PROBE_CLOUD_CONVERSATION_ID
  ) {
    failContext(surface, "item.thread must use the signed-in cloud identity");
  }
  assertJson(surface, "item.data", item.data, {
    id: PROBE_CLOUD_ITEM_ID,
    type: PROBE_TYPE,
    token: "cloud-item",
    nested: { value: 84 },
    values: [{ label: "cloud-deep" }],
    status: "complete",
  });
  if (!Object.isFrozen(item) || !Object.isFrozen(item.thread)) {
    failContext(surface, "conversation-item data must be immutable");
  }
  assertDeepFrozen(surface, "item.data", item.data);
  return evidence(
    surface,
    context,
    {
      layout: context.layout,
      item: {
        id: item.id,
        turnId: item.turnId ?? "",
        status: item.status,
        kind: item.kind,
        sourceKind: item.sourceKind,
        data: item.data,
        presentationVersion: item.presentationVersion,
        label: item.label,
        thread: item.thread,
      },
    },
    "cloud",
    item.thread.accountId,
    item.thread,
  );
}

export function createRichProbeRenderProvider<TContext extends UiOwnerContext>(
  surface: RichProbeSurface,
  recorder: RichProbeEventRecorder,
  validate: (context: TContext) => RichProbeContextEvidence,
  invalidate?: (surface: RichProbeSurface, ownerId: string) => void,
): UiRenderProvider<TContext> {
  return (mount: UiMount<TContext>): Disposable | undefined => {
    if (mount.signal.aborted) return undefined;

    const contextEvidence = validate(mount.context);

    let count = recorder.count(`${surface}.activate`);
    const actionButton = mount.container.ownerDocument.createElement("button");
    actionButton.type = "button";
    actionButton.setAttribute("data-rich-probe-surface", surface);
    actionButton.setAttribute("data-rich-probe-control", "action");
    const invalidateButton = mount.container.ownerDocument.createElement("button");
    invalidateButton.type = "button";
    invalidateButton.setAttribute("data-rich-probe-surface", surface);
    invalidateButton.setAttribute("data-rich-probe-control", "invalidate");
    invalidateButton.textContent = `Invalidate rich probe ${SURFACE_LABELS[surface]}`;
    invalidateButton.setAttribute(
      "aria-label",
      `Invalidate rich probe ${SURFACE_LABELS[surface]}`,
    );

    const updateLabel = (): void => {
      const label = `Rich probe ${SURFACE_LABELS[surface]} ${count}`;
      actionButton.textContent = label;
      actionButton.setAttribute("aria-label", label);
    };
    updateLabel();

    const activate = (): void => {
      count += 1;
      updateLabel();
      void recorder.record(`${surface}.activate`);
    };
    const requestInvalidation = (): void => {
      invalidate?.(surface, mount.context.ownerId);
    };
    actionButton.addEventListener("click", activate);
    invalidateButton.addEventListener("click", requestInvalidation);
    mount.container.append(actionButton);
    mount.container.append(invalidateButton);
    void recorder.record(`${surface}.mount`, contextEvidence);

    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      mount.signal.removeEventListener("abort", dispose);
      actionButton.removeEventListener("click", activate);
      invalidateButton.removeEventListener("click", requestInvalidation);
      actionButton.remove();
      invalidateButton.remove();
      void recorder.record(`${surface}.dispose`);
    };
    mount.signal.addEventListener("abort", dispose, { once: true });
    return { dispose };
  };
}

type RichProbeFallbackOutcome = (typeof FALLBACK_OUTCOMES)[number];

function fallbackOutcome(value: unknown): RichProbeFallbackOutcome | undefined {
  if (typeof value !== "string") return undefined;
  const match = /chatgptx-fallback:(nonMatch|matcherError|rendererError)/.exec(
    value,
  );
  return match?.[1] as RichProbeFallbackOutcome | undefined;
}

function controlledFallbackBehavior<TContext extends UiOwnerContext>(
  kind: string,
  readOutcome: (context: TContext) => RichProbeFallbackOutcome | undefined,
): {
  readonly matches: (context: TContext) => boolean;
  readonly render: UiRenderProvider<TContext>;
} {
  return Object.freeze({
    matches: (context: TContext) => {
      const outcome = readOutcome(context);
      if (outcome === "matcherError") {
        throw new Error(`Controlled ${kind} matcher failure`);
      }
      return outcome === "rendererError";
    },
    render: () => {
      throw new Error(`Controlled ${kind} renderer failure`);
    },
  });
}

function registerControlledFallbacks(
  contributions: ContributionsApi,
): UiRegistration[] {
  const directive = PROBE_FALLBACK_DEFINITIONS.assistantDirective;
  const contentReference =
    PROBE_FALLBACK_DEFINITIONS.assistantContentReference;
  const codeBlock = PROBE_FALLBACK_DEFINITIONS.assistantCodeBlock;
  const conversationItem = PROBE_FALLBACK_DEFINITIONS.conversationItem;
  return [
    contributions.register("assistant-directive", {
      id: directive.id,
      name: directive.value,
      render: () => {
        throw new Error("Controlled assistant directive renderer failure");
      },
    }),
    contributions.register("assistant-content-reference", {
      id: contentReference.id,
      type: contentReference.value,
      ...controlledFallbackBehavior<AssistantContentReferenceUiContext>(
        "assistant content reference",
        (context) => fallbackOutcome(context.reference.data.description),
      ),
    }),
    contributions.register("assistant-code-block", {
      id: codeBlock.id,
      language: codeBlock.value,
      ...controlledFallbackBehavior<AssistantCodeBlockUiContext>(
        "assistant code block",
        (context) => fallbackOutcome(context.codeBlock.content),
      ),
    }),
    contributions.register("conversation-item", {
      id: conversationItem.id,
      type: conversationItem.value,
      ...controlledFallbackBehavior<ConversationItemUiContext>(
        "conversation item",
        (context) =>
          context.item.kind === "opaque"
            ? fallbackOutcome(context.item.data.content)
            : undefined,
      ),
    }),
  ];
}

class RichMessageProbe implements RichMessageProbeHandle {
  readonly #context: RichMessageProbeContext;
  readonly #recorder: RichProbeEventRecorder;
  readonly #registrations: UiRegistration[] = [];
  readonly #successfulRegistrations = new Map<
    RichProbeSurface,
    UiRegistration
  >();
  readonly #invalidatedSurfaces = new Set<RichProbeSurface>();
  #disposed = false;

  constructor(
    context: RichMessageProbeContext,
    recorder: RichProbeEventRecorder,
  ) {
    this.#context = context;
    this.#recorder = recorder;
  }

  install(): this {
    if (this.#context.lifetime.aborted) {
      this.#disposed = true;
      return this;
    }

    const contributions = this.#context.api.contributions;
    const directiveProvider = createRichProbeRenderProvider(
      "directive",
      this.#recorder,
      validateDirectiveContext,
      this.#invalidate,
    );
    const containerDirectiveProvider = createRichProbeRenderProvider(
      "directive-container",
      this.#recorder,
      validateContainerDirectiveContext,
      this.#invalidate,
    );
    const directiveRegistration = contributions.register(
      "assistant-directive",
      {
        id: PROBE_DIRECTIVE_ID,
        name: PROBE_TYPE,
        render: (mount) =>
          mount.context.directive.kind === "container"
            ? containerDirectiveProvider(mount)
            : directiveProvider(mount),
      },
    );
    const contentReferenceRegistration = contributions.register(
      "assistant-content-reference",
      {
        id: PROBE_CONTENT_REFERENCE_ID,
        type: PROBE_TYPE,
        render: createRichProbeRenderProvider(
          "content-reference",
          this.#recorder,
          validateContentReferenceContext,
          this.#invalidate,
        ),
      },
    );
    const codeBlockProvider = createRichProbeRenderProvider(
      "code-block",
      this.#recorder,
      validateCodeBlockContext,
      this.#invalidate,
    );
    const streamingCodeBlockProvider = createRichProbeRenderProvider(
      "code-block-streaming",
      this.#recorder,
      validateStreamingCodeBlockContext,
      this.#invalidate,
    );
    const codeBlockRegistration = contributions.register(
      "assistant-code-block",
      {
        id: PROBE_CODE_BLOCK_ID,
        language: PROBE_TYPE,
        render: (mount) =>
          mount.context.streaming && mount.context.codeBlock.fenceOpen
            ? streamingCodeBlockProvider(mount)
            : codeBlockProvider(mount),
      },
    );
    const conversationItemProvider = createRichProbeRenderProvider(
      "conversation-item",
      this.#recorder,
      validateConversationItemContext,
      this.#invalidate,
    );
    const groupedConversationItemProvider = createRichProbeRenderProvider(
      "conversation-item-grouped",
      this.#recorder,
      validateGroupedConversationItemContext,
      this.#invalidate,
    );
    const conversationItemRegistration = contributions.register(
      "conversation-item",
      {
        id: PROBE_CONVERSATION_ITEM_ID,
        type: PROBE_TYPE,
        matches: (context) =>
          context.item.thread.scope === "execution" &&
          context.item.kind === "opaque" &&
          context.item.sourceKind === PROBE_TYPE,
        render: (mount) =>
          mount.context.layout === "grouped"
            ? groupedConversationItemProvider(mount)
            : conversationItemProvider(mount),
      },
    );
    const cloudConversationItemRegistration = contributions.register(
      "conversation-item",
      {
        id: PROBE_CLOUD_CONVERSATION_ITEM_ID,
        type: PROBE_TYPE,
        matches: (context) =>
          context.item.thread.scope === "cloud" &&
          context.item.kind === "opaque" &&
          context.item.sourceKind === PROBE_TYPE,
        render: createRichProbeRenderProvider(
          "conversation-item-cloud",
          this.#recorder,
          validateCloudConversationItemContext,
          this.#invalidate,
        ),
      },
    );
    this.#successfulRegistrations.set("directive", directiveRegistration);
    this.#successfulRegistrations.set(
      "directive-container",
      directiveRegistration,
    );
    this.#successfulRegistrations.set(
      "content-reference",
      contentReferenceRegistration,
    );
    this.#successfulRegistrations.set("code-block", codeBlockRegistration);
    this.#successfulRegistrations.set(
      "code-block-streaming",
      codeBlockRegistration,
    );
    this.#successfulRegistrations.set(
      "conversation-item",
      conversationItemRegistration,
    );
    this.#successfulRegistrations.set(
      "conversation-item-grouped",
      conversationItemRegistration,
    );
    this.#successfulRegistrations.set(
      "conversation-item-cloud",
      cloudConversationItemRegistration,
    );
    this.#registrations.push(
      directiveRegistration,
      contentReferenceRegistration,
      codeBlockRegistration,
      conversationItemRegistration,
      cloudConversationItemRegistration,
      ...registerControlledFallbacks(contributions),
    );
    this.#context.lifetime.addEventListener("abort", this.dispose, {
      once: true,
    });
    return this;
  }

  readonly #invalidate = (
    surface: RichProbeSurface,
    ownerId: string,
  ): void => {
    if (this.#disposed || this.#invalidatedSurfaces.has(surface)) return;
    const registration = this.#successfulRegistrations.get(surface);
    if (registration === undefined) return;
    this.#invalidatedSurfaces.add(surface);
    void this.#recorder.record(`${surface}.invalidate`);
    registration.invalidate(ownerId);
  };

  flush(): Promise<void> {
    return this.#recorder.flush();
  }

  readonly dispose = (): void => {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#context.lifetime.removeEventListener("abort", this.dispose);
    for (const registration of [...this.#registrations].reverse()) {
      registration.dispose();
    }
    this.#registrations.length = 0;
    void this.#recorder.record("extension.dispose");
  };
}

export async function activateRichMessageProbe(
  context: RichMessageProbeContext,
  eventFile = PROBE_EVENT_FILE,
): Promise<RichMessageProbeHandle> {
  const contents = await context.storage.readTextFile(eventFile, {
    signal: context.lifetime,
  });
  const recorder = new RichProbeEventRecorder(
    context.storage,
    parseRichProbeEventLog(contents),
    eventFile,
  );
  await recorder.record("extension.activate");
  return new RichMessageProbe(context, recorder).install();
}
