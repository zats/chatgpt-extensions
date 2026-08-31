import type {
  InstalledExtension,
  NativeSettingsControlsSectionDefinition,
} from "@chatgptx/api";
import {
  EXTENSION_ID,
  SETTINGS_SECTION_ID,
  enabledSettingKey,
} from "./constants.js";

export function managedExtensions(
  extensions: readonly InstalledExtension[],
): readonly InstalledExtension[] {
  return extensions.filter((extension) => extension.id !== EXTENSION_ID);
}

export function createExtensionsSettingsSection(
  extensions: readonly InstalledExtension[],
): NativeSettingsControlsSectionDefinition {
  const managed = managedExtensions(extensions);
  return Object.freeze({
    id: SETTINGS_SECTION_ID,
    title: "Extensions",
    group: "integrations",
    content: "controls" as const,
    controls: Object.freeze(
      managed.map((extension) =>
        Object.freeze({
          id: `extension.${extension.id}`,
          type: "toggle" as const,
          title: extension.name,
          description: extension.description,
          settingKey: enabledSettingKey(extension.id),
          defaultValue: extension.enabled,
          disabled: extension.required,
          restartRequired: true,
          ...(extension.settingsSectionId === undefined
            ? {}
            : {
                destination: {
                  sectionId: extension.settingsSectionId,
                },
              }),
        }),
      ),
    ),
    searchEntries: Object.freeze(
      managed.map((extension) =>
        Object.freeze({
          title: extension.name,
          keywords: Object.freeze([
            extension.id,
            extension.version,
            extension.description,
          ]),
        }),
      ),
    ),
  } satisfies NativeSettingsControlsSectionDefinition);
}
