import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  AssistantSelectionActionItem,
  ChatGPTXApi,
  UiListItem,
} from "@chatgptx/api";
import { REACTION_ANNOTATION_PREFIX } from "../src/constants.js";
import { createReactionSettings } from "../src/reaction-settings.js";
import {
  createReactionAnnotation,
  installReactionActions,
  transformAssistantSelectionItems,
} from "../src/reactions.js";
import { createMemoryStorage, createSelectionContext } from "./fixtures.js";

describe("reactions contribution", () => {
  test("adds configured reactions below the native selection toolbar", async () => {
    const annotations: Array<{ annotation: string; submit: boolean | undefined }> = [];
    const context = createSelectionContext(async (annotation, options) => {
      annotations.push({ annotation, submit: options?.submit });
    });
    const builtIns: readonly UiListItem<AssistantSelectionActionItem>[] = [
      {
        kind: "action",
        id: "app.add-to-chat",
        label: "Add to chat",
        origin: "app",
      },
      {
        kind: "action",
        id: "app.more-details",
        label: "More details",
        origin: "app",
      },
    ];

    const transformed = transformAssistantSelectionItems(builtIns, context, [
      "🎉",
      "👨‍👩‍👧‍👦",
    ]);
    assert.deepEqual(
      transformed.map((item) => item.id),
      ["app.add-to-chat", "app.more-details", "reaction-1", "reaction-2"],
    );

    const reactions = transformed.slice(builtIns.length) as readonly AssistantSelectionActionItem[];
    assert.deepEqual(reactions.map((item) => item.label), ["🎉", "👨‍👩‍👧‍👦"]);
    assert.deepEqual(reactions.map((item) => item.placement), ["below", "below"]);
    assert.deepEqual(reactions.map((item) => item.labelScale), [2, 2]);
    assert.deepEqual(reactions.map((item) => item.verticalPadding), [4, 4]);

    await reactions[0]?.onActivate?.(context, {
      source: "pointer",
      metaKey: false,
    });
    await reactions[1]?.onActivate?.(context, {
      source: "keyboard",
      metaKey: true,
    });
    assert.deepEqual(annotations, [
      { annotation: `${REACTION_ANNOTATION_PREFIX}🎉`, submit: false },
      { annotation: `${REACTION_ANNOTATION_PREFIX}👨‍👩‍👧‍👦`, submit: true },
    ]);
  });

  test("invalidates the contribution when stored reactions change", async () => {
    const memory = createMemoryStorage();
    const settings = createReactionSettings(memory.api);
    let invalidations = 0;
    let transformer:
      | ((
          items: readonly UiListItem<AssistantSelectionActionItem>[],
          context: ReturnType<typeof createSelectionContext>,
        ) => readonly UiListItem<AssistantSelectionActionItem>[])
      | undefined;

    const api = {
      contributions: {
        transform(_point: string, nextTransformer: typeof transformer) {
          transformer = nextTransformer;
          return {
            invalidate() {
              invalidations += 1;
            },
            dispose() {},
          };
        },
      },
    } as unknown as Pick<ChatGPTXApi, "contributions">;

    const installation = installReactionActions(api, settings);
    await settings.setText("✅🚀");
    assert.equal(invalidations, 1);

    const context = createSelectionContext(async () => undefined);
    const transformed = transformer?.([], context) ?? [];
    assert.deepEqual(transformed.map((item) => item.label), ["✅", "🚀"]);
    installation.dispose();
  });

  test("uses the active selection context when an existing action is activated", async () => {
    const transformedAnnotations: string[] = [];
    const activeAnnotations: string[] = [];
    const transformedContext = createSelectionContext(async (annotation) => {
      transformedAnnotations.push(annotation);
    });
    const activeContext = createSelectionContext(async (annotation) => {
      activeAnnotations.push(annotation);
    });
    const [reaction] = transformAssistantSelectionItems(
      [],
      transformedContext,
      ["👍"],
    ) as readonly AssistantSelectionActionItem[];

    await reaction?.onActivate?.(activeContext, {
      source: "pointer",
      metaKey: false,
    });
    assert.deepEqual(transformedAnnotations, []);
    assert.deepEqual(activeAnnotations, [`${REACTION_ANNOTATION_PREFIX}👍`]);
  });

  test("reports a response annotation failure to the action caller", async () => {
    const expected = Object.assign(new Error("Selection owner is unavailable"), {
      code: "capability-unavailable",
    });
    const context = createSelectionContext(async () => {
      throw expected;
    });
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await assert.rejects(
        createReactionAnnotation(context, "👍", false),
        (error) => error === expected,
      );
    } finally {
      console.error = originalError;
    }
  });
});
