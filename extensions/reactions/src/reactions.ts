import type {
  AssistantSelectionActionContext,
  AssistantSelectionActionItem,
  ChatGPTXApi,
  Disposable,
  UiListItem,
} from "@chatgptx/api";
import { REACTION_ANNOTATION_PREFIX } from "./constants.js";
import { combineDisposables } from "./lifetime.js";
import type { ReactionSettings } from "./reaction-settings.js";

export async function createReactionAnnotation(
  context: AssistantSelectionActionContext,
  emoji: string,
  submit: boolean,
): Promise<void> {
  try {
    await context.createResponseAnnotation(
      `${REACTION_ANNOTATION_PREFIX}${emoji}`,
      { submit },
    );
  } catch (error: unknown) {
    console.error("[reactions] Could not create the reaction", error);
    throw error;
  }
}

export function createReactionItems(
  context: AssistantSelectionActionContext,
  emojis: readonly string[],
): readonly AssistantSelectionActionItem[] {
  return emojis.map((emoji, index) => ({
    kind: "action" as const,
    id: `reaction-${index + 1}`,
    label: emoji,
    placement: "below" as const,
    labelScale: 2 as const,
    verticalPadding: 4 as const,
    onActivate: (activeContext, activation) =>
      createReactionAnnotation(activeContext, emoji, activation.metaKey === true),
  }));
}

export function transformAssistantSelectionItems(
  items: readonly UiListItem<AssistantSelectionActionItem>[],
  context: AssistantSelectionActionContext,
  emojis: readonly string[],
): readonly UiListItem<AssistantSelectionActionItem>[] {
  return [...items, ...createReactionItems(context, emojis)];
}

export function installReactionActions(
  api: Pick<ChatGPTXApi, "contributions">,
  settings: ReactionSettings,
): Disposable {
  const registration = api.contributions.transform(
    "assistant-selection.actions",
    (items, context) =>
      transformAssistantSelectionItems(items, context, settings.emojis),
  );
  const subscription = settings.subscribe(() => registration.invalidate());
  return combineDisposables(registration, subscription);
}
