export const EXTENSION_ID = "extensions";
export const SETTINGS_SECTION_ID = "installed";
export const ENABLED_SETTING_PREFIX = "enabled.";

export function enabledSettingKey(extensionId: string): string {
  return `${ENABLED_SETTING_PREFIX}${extensionId}`;
}
