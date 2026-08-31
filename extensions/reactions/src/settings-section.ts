import type { NativeSettingsControlsSectionDefinition } from "@chatgptx/api";
import {
  DEFAULT_REACTION_TEXT,
  RESET_COMMAND_ID,
  SETTINGS_KEY,
  SETTINGS_SECTION_ID,
} from "./constants.js";
import { parseReactionText } from "./reaction-settings.js";

export function createReactionSettingsSection(): NativeSettingsControlsSectionDefinition {
  return Object.freeze({
    id: SETTINGS_SECTION_ID,
    title: "Reactions",
    group: "integrations",
    content: "controls" as const,
    controls: Object.freeze([
      Object.freeze({
        id: SETTINGS_KEY,
        type: "text" as const,
        title: "Emojis",
        description: "Enter one or more emoji.",
        settingKey: SETTINGS_KEY,
        placeholder: DEFAULT_REACTION_TEXT,
        defaultValue: DEFAULT_REACTION_TEXT,
        validate(value: string) {
          return parseReactionText(value) === undefined
            ? "Enter emoji only."
            : undefined;
        },
      }),
      Object.freeze({
        id: RESET_COMMAND_ID,
        type: "button" as const,
        title: "Reset",
        description: "Restore the default reactions.",
        commandId: RESET_COMMAND_ID,
      }),
    ]),
    searchEntries: Object.freeze([
      Object.freeze({
        title: "Reaction emojis",
        keywords: Object.freeze([
          "reaction",
          "emoji",
          "assistant text",
          "default",
        ]),
      }),
    ]),
  } satisfies NativeSettingsControlsSectionDefinition);
}
