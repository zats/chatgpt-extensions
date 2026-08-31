import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  AssistantCodeBlockUiContext,
  AssistantContentReferenceUiContext,
  AssistantDirectiveUiContext,
  ContributionsApi,
  ConversationItemUiContext,
  Disposable,
  ExtensionStorageApi,
  UiOwnerContext,
  UiRenderProvider,
} from "@chatgptx/api";
import {
  PROBE_CODE_BLOCK_ID,
  PROBE_CLOUD_CONVERSATION_ITEM_ID,
  PROBE_CONTENT_REFERENCE_ID,
  PROBE_CONVERSATION_ITEM_ID,
  PROBE_DIRECTIVE_ID,
  PROBE_EVENT_FILE,
  PROBE_FALLBACK_DEFINITIONS,
  PROBE_TYPE,
  activateRichMessageProbe,
  parseRichProbeEventLog,
  richProbeEventFile,
  serializeRichProbeEventLog,
} from "../src/rich-message-probe.js";

const CONVERSATION_ID = "chatgptx-rich-probe";
const TURN_ID = "chatgptx-rich-probe-turn";
const TURN_MESSAGE_ID = "chatgptx-rich-probe-turn-message";
const REFERENCE_MESSAGE_ID = "chatgptx-rich-probe-reference-message";
const DIRECTIVE_INSTANCE_ID = "chatgptx-rich-probe-directive:0";
const CONTAINER_DIRECTIVE_INSTANCE_ID =
  "chatgptx-rich-probe-directive-container:0";
const ITEM_ID = "chatgptx-rich-probe-item";
const GROUPED_ITEM_ID = "chatgptx-rich-probe-grouped-item";
const CLOUD_CONVERSATION_ID = "chatgptx-rich-probe-cloud";
const CLOUD_TURN_ID = "chatgptx-rich-probe-cloud-turn";
const CLOUD_ITEM_ID = "chatgptx-rich-probe-cloud-item";
const FALLBACK_REGISTRATION_IDS = [
  PROBE_FALLBACK_DEFINITIONS.assistantDirective.id,
  PROBE_FALLBACK_DEFINITIONS.assistantContentReference.id,
  PROBE_FALLBACK_DEFINITIONS.assistantCodeBlock.id,
  PROBE_FALLBACK_DEFINITIONS.conversationItem.id,
];

interface CapturedDefinition {
  readonly kind: string;
  readonly id: string;
  readonly name?: string;
  readonly type?: string;
  readonly language?: string;
  readonly matches?: (context: never) => boolean;
  readonly render: UiRenderProvider<UiOwnerContext>;
}

interface Harness {
  readonly contributions: ContributionsApi;
  readonly storage: ExtensionStorageApi;
  readonly definitions: CapturedDefinition[];
  readonly writes: string[];
  readonly disposed: string[];
  readonly invalidations: Array<{
    readonly id: string;
    readonly ownerId: string | undefined;
  }>;
}

function createHarness(initialStorage?: string): Harness {
  const definitions: CapturedDefinition[] = [];
  const writes: string[] = [];
  const disposed: string[] = [];
  const invalidations: Array<{
    readonly id: string;
    readonly ownerId: string | undefined;
  }> = [];
  let contents = initialStorage;

  const contributions: ContributionsApi = {
    async listPoints() {
      return [];
    },
    async listDefinitionKinds() {
      return [];
    },
    transform() {
      throw new Error("The probe does not use list transformations");
    },
    register(kind, definition) {
      const captured = { kind, ...definition } as CapturedDefinition;
      definitions.push(captured);
      return {
        invalidate(ownerId) {
          invalidations.push({ id: captured.id, ownerId });
        },
        dispose() {
          disposed.push(captured.id);
        },
      };
    },
    render() {
      throw new Error("The probe does not use render points");
    },
  };

  const storage: ExtensionStorageApi = {
    async listFiles() {
      return contents === undefined ? [] : [PROBE_EVENT_FILE];
    },
    async readTextFile(path) {
      assert.equal(path, PROBE_EVENT_FILE);
      return contents;
    },
    async writeTextFile(path, nextContents) {
      assert.equal(path, PROBE_EVENT_FILE);
      contents = nextContents;
      writes.push(nextContents);
    },
    async deleteFile() {
      contents = undefined;
    },
  };

  return {
    contributions,
    storage,
    definitions,
    writes,
    disposed,
    invalidations,
  };
}

function definitionById(harness: Harness, id: string): CapturedDefinition {
  const definition = harness.definitions.find((candidate) => candidate.id === id);
  assert.ok(definition, `missing definition ${id}`);
  return definition;
}

type Listener = () => void;

class FakeButton {
  readonly #attributes = new Map<string, string>();
  readonly #listeners = new Map<string, Set<Listener>>();
  parent: FakeContainer | undefined;
  type = "";
  textContent = "";

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  getAttribute(name: string): string | undefined {
    return this.#attributes.get(name);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.#listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.#listeners.get(type)?.delete(listener);
  }

  click(): void {
    for (const listener of this.#listeners.get("click") ?? []) listener();
  }

  remove(): void {
    this.parent?.remove(this);
  }
}

class FakeContainer {
  readonly children: FakeButton[] = [];
  readonly ownerDocument = {
    createElement: (tagName: string): FakeButton => {
      assert.equal(tagName, "button");
      return new FakeButton();
    },
  };

  append(button: FakeButton): void {
    button.parent = this;
    this.children.push(button);
  }

  remove(button: FakeButton): void {
    const index = this.children.indexOf(button);
    if (index >= 0) this.children.splice(index, 1);
    button.parent = undefined;
  }
}

function mountProvider<TContext extends UiOwnerContext>(
  provider: UiRenderProvider<TContext>,
  context: TContext,
): {
  readonly button: FakeButton;
  readonly invalidateButton: FakeButton;
  readonly container: FakeContainer;
  readonly disposable: Disposable;
} {
  const container = new FakeContainer();
  const controller = new AbortController();
  const disposable = provider({
    id: `mount-${context.ownerId}`,
    ownerId: context.ownerId,
    windowId: context.windowId,
    container: container as unknown as HTMLElement,
    context,
    signal: controller.signal,
  });
  assert.ok(disposable);
  const button = container.children[0];
  const invalidateButton = container.children[1];
  assert.ok(button);
  assert.ok(invalidateButton);
  return { button, invalidateButton, container, disposable };
}

function directiveContext(token = "directive"): AssistantDirectiveUiContext {
  return Object.freeze({
    ownerId: "owner-directive",
    windowId: "window-1",
    thread: Object.freeze({
      scope: "execution" as const,
      hostId: "local",
      threadId: CONVERSATION_ID,
    }),
    conversationId: CONVERSATION_ID,
    messageId: TURN_MESSAGE_ID,
    turnId: TURN_ID,
    hostId: "local",
    streaming: false,
    directive: Object.freeze({
      name: PROBE_TYPE,
      kind: "leaf" as const,
      attributes: Object.freeze({ token }),
      directiveId: DIRECTIVE_INSTANCE_ID,
      terminalInline: true,
    }),
  });
}

function containerDirectiveContext(
  token = "directive-container",
): AssistantDirectiveUiContext {
  return Object.freeze({
    ...directiveContext(),
    ownerId: "owner-directive-container",
    directive: Object.freeze({
      name: PROBE_TYPE,
      kind: "container" as const,
      attributes: Object.freeze({ token }),
      directiveId: CONTAINER_DIRECTIVE_INSTANCE_ID,
      terminalInline: false,
      content: "Container directive content",
    }),
  });
}

function contentReferenceContext(
  token = "reference",
): AssistantContentReferenceUiContext {
  return Object.freeze({
    ownerId: "owner-content-reference",
    windowId: "window-1",
    thread: Object.freeze({
      scope: "execution" as const,
      hostId: "local",
      threadId: CONVERSATION_ID,
    }),
    conversationId: CONVERSATION_ID,
    messageId: REFERENCE_MESSAGE_ID,
    turnId: TURN_ID,
    hostId: "local",
    streaming: false,
    reference: Object.freeze({
      type: PROBE_TYPE,
      data: Object.freeze({
        type: PROBE_TYPE,
        token,
        nested: Object.freeze({ value: 42 }),
        values: Object.freeze([Object.freeze({ label: "deep" })]),
      }),
    }),
    index: 0,
    terminalInline: true,
  });
}

function codeBlockContext(token = "code"): AssistantCodeBlockUiContext {
  return Object.freeze({
    ownerId: "owner-code-block",
    windowId: "window-1",
    thread: Object.freeze({
      scope: "execution" as const,
      hostId: "local",
      threadId: CONVERSATION_ID,
    }),
    conversationId: CONVERSATION_ID,
    messageId: TURN_MESSAGE_ID,
    turnId: TURN_ID,
    hostId: "local",
    streaming: false,
    codeBlock: Object.freeze({
      index: 0,
      language: PROBE_TYPE,
      content: `{"token":"${token}"}`,
      fenceOpen: false,
      info: PROBE_TYPE,
    }),
  });
}

function streamingCodeBlockContext(
  token = "streaming",
): AssistantCodeBlockUiContext {
  return Object.freeze({
    ...codeBlockContext(),
    ownerId: "owner-code-block-streaming",
    streaming: true,
    codeBlock: Object.freeze({
      index: 1,
      language: PROBE_TYPE,
      content: `{"token":"${token}"}`,
      fenceOpen: true,
      info: PROBE_TYPE,
    }),
  });
}

function conversationItemContext(token = "item"): ConversationItemUiContext {
  return Object.freeze({
    ownerId: "owner-conversation-item",
    windowId: "window-1",
    conversationId: CONVERSATION_ID,
    turnId: TURN_ID,
    hostId: "local",
    item: Object.freeze({
      id: ITEM_ID,
      thread: Object.freeze({
        scope: "execution" as const,
        hostId: "local",
        threadId: CONVERSATION_ID,
      }),
      turnId: TURN_ID,
      status: "complete" as const,
      kind: "opaque" as const,
      sourceKind: PROBE_TYPE,
      data: Object.freeze({
        id: ITEM_ID,
        type: PROBE_TYPE,
        token,
        nested: Object.freeze({ value: 42 }),
        values: Object.freeze([Object.freeze({ label: "deep" })]),
        status: "complete",
      }),
      presentationVersion: 1,
      label: PROBE_TYPE,
    }),
    layout: "standalone" as const,
  });
}

function groupedConversationItemContext(
  token = "grouped-item",
): ConversationItemUiContext {
  return Object.freeze({
    ...conversationItemContext(),
    ownerId: "owner-conversation-item-grouped",
    item: Object.freeze({
      id: GROUPED_ITEM_ID,
      thread: Object.freeze({
        scope: "execution" as const,
        hostId: "local",
        threadId: CONVERSATION_ID,
      }),
      turnId: TURN_ID,
      status: "complete" as const,
      kind: "opaque" as const,
      sourceKind: PROBE_TYPE,
      data: Object.freeze({
        id: GROUPED_ITEM_ID,
        type: PROBE_TYPE,
        token,
        status: "complete",
      }),
      presentationVersion: 1,
      label: PROBE_TYPE,
    }),
    layout: "grouped" as const,
  });
}

function cloudConversationItemContext(
  token = "cloud-item",
): ConversationItemUiContext {
  return Object.freeze({
    ownerId: "owner-conversation-item-cloud",
    windowId: "window-1",
    conversationId: CLOUD_CONVERSATION_ID,
    turnId: CLOUD_TURN_ID,
    hostId: "cloud",
    item: Object.freeze({
      id: CLOUD_ITEM_ID,
      thread: Object.freeze({
        scope: "cloud" as const,
        accountId: "account-1",
        threadId: CLOUD_CONVERSATION_ID,
      }),
      turnId: CLOUD_TURN_ID,
      status: "complete" as const,
      kind: "opaque" as const,
      sourceKind: PROBE_TYPE,
      data: Object.freeze({
        id: CLOUD_ITEM_ID,
        type: PROBE_TYPE,
        token,
        nested: Object.freeze({ value: 84 }),
        values: Object.freeze([Object.freeze({ label: "cloud-deep" })]),
        status: "complete",
      }),
      presentationVersion: 1,
      label: PROBE_TYPE,
    }),
    layout: "standalone" as const,
  });
}

describe("Rich Message Probe", () => {
  test("scopes live evidence to one renderer document", () => {
    assert.equal(
      richProbeEventFile("document:one/two"),
      "events/document%3Aone%2Ftwo.json",
    );
    assert.throws(() => richProbeEventFile(""), /document ID is required/);
  });

  test("parses and serializes deterministic context evidence", () => {
    const context = {
      surface: "directive" as const,
      ownerId: "owner-directive",
      windowId: "window-1",
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      hostId: "local",
      scope: "execution" as const,
      thread: {
        scope: "execution" as const,
        hostId: "local",
        threadId: CONVERSATION_ID,
      },
      value: { directive: { token: "directive" } },
    };
    const contents = serializeRichProbeEventLog([
      { sequence: 1, name: "extension.activate" },
      { sequence: 2, name: "directive.mount", context },
      { sequence: 3, name: "directive.dispose" },
    ]);
    assert.deepEqual(parseRichProbeEventLog(contents), [
      { sequence: 1, name: "extension.activate" },
      { sequence: 2, name: "directive.mount", context },
      { sequence: 3, name: "directive.dispose" },
    ]);
    assert.throws(
      () =>
        parseRichProbeEventLog(
          '{"events":[{"sequence":2,"name":"directive.mount"}]}',
        ),
      /invalid event/,
    );
    assert.throws(
      () =>
        parseRichProbeEventLog(
          '{"events":[{"sequence":1,"name":"directive.mount","context":{"surface":"directive","ownerId":"x","windowId":"x","conversationId":"wrong","turnId":"x","hostId":"local","value":{}}}]}',
        ),
      /invalid event/,
    );
  });

  test("registers eight successful surface variants and every fallback case", async () => {
    const harness = createHarness();
    const handle = await activateRichMessageProbe({
      api: { contributions: harness.contributions },
      storage: harness.storage,
      lifetime: new AbortController().signal,
    });

    const fallbackOutcomes = [
      "nonMatch",
      "matcherError",
      "rendererError",
    ] as const;

    assert.deepEqual(
      harness.definitions.map(({ kind }) => kind),
      [
        "assistant-directive",
        "assistant-content-reference",
        "assistant-code-block",
        "conversation-item",
        "conversation-item",
        "assistant-directive",
        "assistant-content-reference",
        "assistant-code-block",
        "conversation-item",
      ],
    );
    assert.deepEqual(
      harness.definitions.map(({ id }) => id),
      [
        PROBE_DIRECTIVE_ID,
        PROBE_CONTENT_REFERENCE_ID,
        PROBE_CODE_BLOCK_ID,
        PROBE_CONVERSATION_ITEM_ID,
        PROBE_CLOUD_CONVERSATION_ITEM_ID,
        ...FALLBACK_REGISTRATION_IDS,
      ],
    );
    assert.equal(definitionById(harness, PROBE_DIRECTIVE_ID).name, PROBE_TYPE);
    assert.equal(
      definitionById(harness, PROBE_CONTENT_REFERENCE_ID).type,
      PROBE_TYPE,
    );
    assert.equal(
      definitionById(harness, PROBE_CODE_BLOCK_ID).language,
      PROBE_TYPE,
    );
    assert.equal(
      definitionById(harness, PROBE_CONVERSATION_ITEM_ID).type,
      PROBE_TYPE,
    );
    assert.equal(
      definitionById(harness, PROBE_CLOUD_CONVERSATION_ITEM_ID).type,
      PROBE_TYPE,
    );

    const itemMatches = definitionById(
      harness,
      PROBE_CONVERSATION_ITEM_ID,
    ).matches as unknown as (context: ConversationItemUiContext) => boolean;
    assert.equal(itemMatches(conversationItemContext()), true);
    assert.equal(itemMatches(cloudConversationItemContext()), false);
    const cloudItemMatches = definitionById(
      harness,
      PROBE_CLOUD_CONVERSATION_ITEM_ID,
    ).matches as unknown as (context: ConversationItemUiContext) => boolean;
    assert.equal(cloudItemMatches(cloudConversationItemContext()), true);
    assert.equal(cloudItemMatches(conversationItemContext()), false);
    const otherItemContext = conversationItemContext();
    assert.equal(otherItemContext.item.kind, "opaque");
    if (otherItemContext.item.kind !== "opaque") {
      throw new Error("The test fixture must use an opaque item");
    }
    assert.equal(
      itemMatches({
        ...otherItemContext,
        item: { ...otherItemContext.item, sourceKind: "app.other" },
      }),
      false,
    );

    const directiveFallback = definitionById(
      harness,
      PROBE_FALLBACK_DEFINITIONS.assistantDirective.id,
    );
    assert.equal(
      directiveFallback.name,
      PROBE_FALLBACK_DEFINITIONS.assistantDirective.value,
    );
    assert.equal(directiveFallback.matches, undefined);
    assert.throws(
      () => directiveFallback.render(undefined as never),
      /Controlled assistant directive renderer failure/,
    );

    const contentReferenceFallback = definitionById(
      harness,
      PROBE_FALLBACK_DEFINITIONS.assistantContentReference.id,
    );
    const codeBlockFallback = definitionById(
      harness,
      PROBE_FALLBACK_DEFINITIONS.assistantCodeBlock.id,
    );
    const conversationItemFallback = definitionById(
      harness,
      PROBE_FALLBACK_DEFINITIONS.conversationItem.id,
    );
    assert.equal(
      contentReferenceFallback.type,
      PROBE_FALLBACK_DEFINITIONS.assistantContentReference.value,
    );
    assert.equal(
      codeBlockFallback.language,
      PROBE_FALLBACK_DEFINITIONS.assistantCodeBlock.value,
    );
    assert.equal(
      conversationItemFallback.type,
      PROBE_FALLBACK_DEFINITIONS.conversationItem.value,
    );

    for (const outcome of fallbackOutcomes) {
      const marker = `chatgptx-fallback:${outcome}`;
      const contentReference = contentReferenceContext();
      const codeBlock = codeBlockContext();
      const conversationItem = conversationItemContext();
      if (conversationItem.item.kind !== "opaque") {
        throw new Error("The fallback fixture must use an opaque item");
      }
      const candidates = [
        [
          contentReferenceFallback,
          {
            ...contentReference,
            reference: {
              ...contentReference.reference,
              data: { ...contentReference.reference.data, description: marker },
            },
          },
        ],
        [
          codeBlockFallback,
          {
            ...codeBlock,
            codeBlock: { ...codeBlock.codeBlock, content: marker },
          },
        ],
        [
          conversationItemFallback,
          {
            ...conversationItem,
            item: {
              ...conversationItem.item,
              data: { ...conversationItem.item.data, content: marker },
            },
          },
        ],
      ] as const;
      for (const [definition, context] of candidates) {
        if (outcome === "matcherError") {
          assert.throws(
            () => definition.matches?.(context as never),
            /Controlled .* matcher failure/,
          );
        } else {
          assert.equal(
            definition.matches?.(context as never),
            outcome === "rendererError",
          );
        }
      }
    }
    for (const definition of [
      contentReferenceFallback,
      codeBlockFallback,
      conversationItemFallback,
    ]) {
      assert.throws(
        () => definition.render(undefined as never),
        /Controlled .* renderer failure/,
      );
    }

    handle.dispose();
    await handle.flush();
    assert.deepEqual(harness.disposed, [
      ...FALLBACK_REGISTRATION_IDS.toReversed(),
      PROBE_CLOUD_CONVERSATION_ITEM_ID,
      PROBE_CONVERSATION_ITEM_ID,
      PROBE_CODE_BLOCK_ID,
      PROBE_CONTENT_REFERENCE_ID,
      PROBE_DIRECTIVE_ID,
    ]);
    assert.deepEqual(
      parseRichProbeEventLog(harness.writes.at(-1)).map(({ name }) => name),
      ["extension.activate", "extension.dispose"],
    );
  });

  test("validates and records the exact public context for all eight surface variants", async () => {
    assert.notEqual(REFERENCE_MESSAGE_ID, TURN_MESSAGE_ID);
    const harness = createHarness();
    const handle = await activateRichMessageProbe({
      api: { contributions: harness.contributions },
      storage: harness.storage,
      lifetime: new AbortController().signal,
    });
    const expected = [
      {
        id: PROBE_DIRECTIVE_ID,
        label: "directive",
        context: directiveContext(),
      },
      {
        id: PROBE_DIRECTIVE_ID,
        label: "container directive",
        context: containerDirectiveContext(),
      },
      {
        id: PROBE_CONTENT_REFERENCE_ID,
        label: "content reference",
        context: contentReferenceContext(),
      },
      {
        id: PROBE_CODE_BLOCK_ID,
        label: "code block",
        context: codeBlockContext(),
      },
      {
        id: PROBE_CODE_BLOCK_ID,
        label: "streaming code block",
        context: streamingCodeBlockContext(),
      },
      {
        id: PROBE_CONVERSATION_ITEM_ID,
        label: "conversation item",
        context: conversationItemContext(),
      },
      {
        id: PROBE_CONVERSATION_ITEM_ID,
        label: "grouped conversation item",
        context: groupedConversationItemContext(),
      },
      {
        id: PROBE_CLOUD_CONVERSATION_ITEM_ID,
        label: "cloud conversation item",
        context: cloudConversationItemContext(),
      },
    ] as const;
    const mountExpected = ({ id, label, context }: (typeof expected)[number]) => {
      const definition = definitionById(harness, id);
      const mount = mountProvider(
        definition.render,
        context as unknown as UiOwnerContext,
      );
      assert.equal(mount.button.type, "button");
      assert.equal(
        mount.button.getAttribute("data-rich-probe-surface"),
        context.ownerId.slice("owner-".length),
      );
      assert.equal(mount.button.getAttribute("data-rich-probe-control"), "action");
      assert.equal(mount.button.textContent, `Rich probe ${label} 0`);
      assert.equal(
        mount.button.getAttribute("aria-label"),
        `Rich probe ${label} 0`,
      );
      assert.equal(mount.invalidateButton.type, "button");
      assert.equal(
        mount.invalidateButton.getAttribute("data-rich-probe-surface"),
        context.ownerId.slice("owner-".length),
      );
      assert.equal(
        mount.invalidateButton.getAttribute("data-rich-probe-control"),
        "invalidate",
      );
      assert.equal(
        mount.invalidateButton.textContent,
        `Invalidate rich probe ${label}`,
      );
      assert.equal(
        mount.invalidateButton.getAttribute("aria-label"),
        `Invalidate rich probe ${label}`,
      );
      return { ...mount, label };
    };
    const firstMounts = expected.map(mountExpected);
    const replacementMounts = [] as ReturnType<typeof mountExpected>[];

    for (const [index, mount] of firstMounts.entries()) {
      mount.invalidateButton.click();
      assert.deepEqual(harness.invalidations[index], {
        id: expected[index]?.id,
        ownerId: expected[index]?.context.ownerId,
      });
      mount.disposable.dispose();
      assert.equal(mount.container.children.length, 0);
      for (const stableMount of firstMounts.slice(index + 1)) {
        assert.equal(stableMount.container.children.length, 2);
      }
      replacementMounts.push(mountExpected(expected[index]!));
    }
    assert.equal(harness.invalidations.length, 8);

    for (const mount of replacementMounts) {
      mount.button.click();
      assert.equal(mount.button.textContent, `Rich probe ${mount.label} 1`);
      assert.equal(
        mount.button.getAttribute("aria-label"),
        `Rich probe ${mount.label} 1`,
      );
      mount.invalidateButton.click();
      assert.equal(harness.invalidations.length, 8);
    }
    for (const mount of replacementMounts) {
      mount.disposable.dispose();
      assert.equal(mount.container.children.length, 0);
    }
    await handle.flush();

    const events = parseRichProbeEventLog(harness.writes.at(-1));
    const surfaces = [
      "directive",
      "directive-container",
      "content-reference",
      "code-block",
      "code-block-streaming",
      "conversation-item",
      "conversation-item-grouped",
      "conversation-item-cloud",
    ] as const;
    assert.deepEqual(
      events.map(({ name }) => name),
      [
        "extension.activate",
        ...surfaces.map((surface) => `${surface}.mount`),
        ...surfaces.flatMap((surface) => [
          `${surface}.invalidate`,
          `${surface}.dispose`,
          `${surface}.mount`,
        ]),
        ...surfaces.map((surface) => `${surface}.activate`),
        ...surfaces.map((surface) => `${surface}.dispose`),
      ],
    );
    assert.deepEqual(
      events
        .filter(({ context }) => context !== undefined)
        .map(({ context }) => context?.surface),
      [...surfaces, ...surfaces],
    );
    assert.deepEqual(
      events.find(({ name }) => name === "directive.mount")?.context?.value,
      {
        streaming: false,
        messageId: TURN_MESSAGE_ID,
        directive: {
          name: PROBE_TYPE,
          kind: "leaf",
          attributes: { token: "directive" },
          directiveId: DIRECTIVE_INSTANCE_ID,
          terminalInline: true,
        },
      },
    );
    assert.deepEqual(
      events.find(({ name }) => name === "content-reference.mount")?.context
        ?.value,
      {
        streaming: false,
        messageId: REFERENCE_MESSAGE_ID,
        reference: {
          type: PROBE_TYPE,
          data: {
            type: PROBE_TYPE,
            token: "reference",
            nested: { value: 42 },
            values: [{ label: "deep" }],
          },
        },
        index: 0,
        terminalInline: true,
      },
    );
    assert.deepEqual(
      events.find(({ name }) => name === "code-block.mount")?.context?.value,
      {
        streaming: false,
        messageId: TURN_MESSAGE_ID,
        codeBlock: {
          index: 0,
          language: PROBE_TYPE,
          content: '{"token":"code"}',
          fenceOpen: false,
          info: PROBE_TYPE,
        },
      },
    );
    assert.deepEqual(
      events.find(({ name }) => name === "conversation-item.mount")?.context
        ?.value,
      {
        layout: "standalone",
        item: {
          id: ITEM_ID,
          turnId: TURN_ID,
          status: "complete",
          kind: "opaque",
          sourceKind: PROBE_TYPE,
          data: {
            id: ITEM_ID,
            type: PROBE_TYPE,
            token: "item",
            nested: { value: 42 },
            values: [{ label: "deep" }],
            status: "complete",
          },
          presentationVersion: 1,
          label: PROBE_TYPE,
          thread: {
            scope: "execution",
            hostId: "local",
            threadId: CONVERSATION_ID,
          },
        },
      },
    );
    assert.deepEqual(
      events.find(({ name }) => name === "conversation-item-cloud.mount")
        ?.context?.value,
      {
        layout: "standalone",
        item: {
          id: CLOUD_ITEM_ID,
          turnId: CLOUD_TURN_ID,
          status: "complete",
          kind: "opaque",
          sourceKind: PROBE_TYPE,
          data: {
            id: CLOUD_ITEM_ID,
            type: PROBE_TYPE,
            token: "cloud-item",
            nested: { value: 84 },
            values: [{ label: "cloud-deep" }],
            status: "complete",
          },
          presentationVersion: 1,
          label: PROBE_TYPE,
          thread: {
            scope: "cloud",
            accountId: "account-1",
            threadId: CLOUD_CONVERSATION_ID,
          },
        },
      },
    );

    handle.dispose();
    await handle.flush();
  });

  test("rejects incorrect mapped data before it mounts extension UI", async () => {
    const harness = createHarness();
    const handle = await activateRichMessageProbe({
      api: { contributions: harness.contributions },
      storage: harness.storage,
      lifetime: new AbortController().signal,
    });
    const invalid = [
      [PROBE_DIRECTIVE_ID, directiveContext("wrong")],
      [PROBE_CONTENT_REFERENCE_ID, contentReferenceContext("wrong")],
      [PROBE_CODE_BLOCK_ID, codeBlockContext("wrong")],
      [PROBE_CONVERSATION_ITEM_ID, conversationItemContext("wrong")],
      [
        PROBE_CLOUD_CONVERSATION_ITEM_ID,
        cloudConversationItemContext("wrong"),
      ],
    ] as const;
    for (const [id, context] of invalid) {
      assert.throws(
        () =>
          mountProvider(
            definitionById(harness, id).render,
            context as unknown as UiOwnerContext,
          ),
        /context is invalid/,
      );
    }
    const reference = contentReferenceContext();
    const shallowReference = Object.freeze({
      ...reference,
      reference: Object.freeze({
        ...reference.reference,
        data: Object.freeze({
          type: PROBE_TYPE,
          token: "reference",
          nested: Object.freeze({ value: 42 }),
          values: Object.freeze([{ label: "deep" }]),
        }),
      }),
    });
    assert.throws(
      () =>
        mountProvider(
          definitionById(harness, PROBE_CONTENT_REFERENCE_ID).render,
          shallowReference,
        ),
      /deeply immutable/,
    );
    const conversationItem = conversationItemContext();
    assert.equal(conversationItem.item.kind, "opaque");
    if (conversationItem.item.kind !== "opaque") {
      throw new Error("The test fixture must use an opaque item");
    }
    const shallowConversationItem = Object.freeze({
      ...conversationItem,
      item: Object.freeze({
        ...conversationItem.item,
        data: Object.freeze({
          id: ITEM_ID,
          type: PROBE_TYPE,
          token: "item",
          nested: { value: 42 },
          values: Object.freeze([Object.freeze({ label: "deep" })]),
          status: "complete",
        }),
      }),
    });
    assert.throws(
      () =>
        mountProvider(
          definitionById(harness, PROBE_CONVERSATION_ITEM_ID).render,
          shallowConversationItem,
        ),
      /deeply immutable/,
    );
    await handle.flush();
    assert.deepEqual(
      parseRichProbeEventLog(harness.writes.at(-1)).map(({ name }) => name),
      ["extension.activate"],
    );
    handle.dispose();
    await handle.flush();
  });

  test("aborting the extension lifetime disposes every definition once", async () => {
    const harness = createHarness();
    const lifetime = new AbortController();
    const handle = await activateRichMessageProbe({
      api: { contributions: harness.contributions },
      storage: harness.storage,
      lifetime: lifetime.signal,
    });

    lifetime.abort();
    handle.dispose();
    await handle.flush();
    assert.deepEqual(harness.disposed, [
      ...FALLBACK_REGISTRATION_IDS.toReversed(),
      PROBE_CLOUD_CONVERSATION_ITEM_ID,
      PROBE_CONVERSATION_ITEM_ID,
      PROBE_CODE_BLOCK_ID,
      PROBE_CONTENT_REFERENCE_ID,
      PROBE_DIRECTIVE_ID,
    ]);
    assert.deepEqual(
      parseRichProbeEventLog(harness.writes.at(-1)).map(({ name }) => name),
      ["extension.activate", "extension.dispose"],
    );
  });
});
