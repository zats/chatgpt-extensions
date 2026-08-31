import type {
  AccountId,
  CloudWorkspaceId,
  EventSource,
  HostId,
  JsonObject,
  JsonValue,
  RequestOptions,
} from "./core.js";
import type { ProjectLocator, ThreadLocator } from "./identifiers.js";
import type { UiIcon, UiOwnerContext, UiRenderProvider } from "./ui-core.js";

export type SettingKey = string;
export type BuiltInSettingsSectionId =
  | "agent"
  | "appearance"
  | "appshots"
  | "browser-use"
  | "chronicle"
  | "cloud-environments"
  | "cloud-settings"
  | "code-review"
  | "debug"
  | "environments"
  | "general-settings"
  | "git-settings"
  | "hooks-settings"
  | "import"
  | "keyboard-shortcuts"
  | "local-environments"
  | "mcp-settings"
  | "personalization"
  | "plugins-settings"
  | "skills-settings"
  | "usage"
  | "voice"
  | "worktrees";
export type SettingsSectionId = BuiltInSettingsSectionId | (string & {});
export type SettingValue = JsonValue;

/** Normalized public scopes. The adapter owns the current backing stores. */
export type SettingsScope =
  | { readonly kind: "account"; readonly accountId: AccountId }
  | { readonly kind: "host"; readonly hostId: HostId }
  | {
      readonly kind: "cloud-workspace";
      readonly accountId: AccountId;
      readonly workspaceId: CloudWorkspaceId;
    }
  | { readonly kind: "project"; readonly project: ProjectLocator }
  | { readonly kind: "thread"; readonly thread: ThreadLocator }
  | { readonly kind: "extension" };

export interface SettingReadOptions extends RequestOptions {
  readonly scope?: SettingsScope;
}

export type SettingWriteOptions = SettingReadOptions;

export interface SettingsSection {
  readonly id: SettingsSectionId;
  readonly title: string;
  readonly group: string;
  readonly icon?: UiIcon;
  readonly visible: boolean;
  readonly external: boolean;
  readonly hostScoped: boolean;
  readonly controls: readonly SettingControl[];
}

export interface SettingsOpenOptions extends RequestOptions {
  readonly sectionId?: SettingsSectionId;
  readonly controlId?: string;
  readonly hostId?: HostId;
}

export interface BaseSettingControl {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly settingKey?: SettingKey;
  readonly disabled?: boolean;
  readonly restartRequired?: boolean;
  /** Native disclosure target shown on this settings row. */
  readonly destination?: {
    readonly sectionId: SettingsSectionId;
    readonly controlId?: string;
  };
}

export interface ToggleSettingControl extends BaseSettingControl {
  readonly type: "toggle";
  readonly defaultValue?: boolean;
}

export interface TextSettingControl extends BaseSettingControl {
  readonly type: "text";
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly secure?: boolean;
  /**
   * Validate the complete text after each native input change.
   *
   * Return an error message to keep the text as a local editable draft. The
   * runtime shows that message and does not write or broadcast the draft.
   * Return `undefined` to accept the text and write `settingKey`.
   */
  readonly validate?: (value: string) => string | undefined;
}

export interface NumberSettingControl extends BaseSettingControl {
  readonly type: "number";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly defaultValue?: number;
}

export interface ChoiceSettingOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface ChoiceSettingControl extends BaseSettingControl {
  readonly type: "select" | "radio" | "segmented";
  readonly options: readonly ChoiceSettingOption[];
  readonly defaultValue?: string;
}

export interface ActionSettingControl extends BaseSettingControl {
  readonly type: "button" | "link";
  readonly commandId?: string;
  readonly href?: string;
}

export interface HotkeySettingControl extends BaseSettingControl {
  readonly type: "hotkey";
  readonly defaultValue?: string;
  readonly allowGlobal?: boolean;
}

export interface PathSettingControl extends BaseSettingControl {
  readonly type: "file" | "folder";
  readonly multiple?: boolean;
  readonly allowedExtensions?: readonly string[];
}

export interface HostSettingControl extends BaseSettingControl {
  readonly type: "host";
  readonly allowMultiple?: boolean;
}

export interface ListSettingControl extends BaseSettingControl {
  readonly type: "list";
  readonly itemTitle: string;
  readonly addCommandId?: string;
  readonly editCommandId?: string;
  readonly deleteCommandId?: string;
}

export type SettingControl =
  | ToggleSettingControl
  | TextSettingControl
  | NumberSettingControl
  | ChoiceSettingControl
  | ActionSettingControl
  | HotkeySettingControl
  | PathSettingControl
  | HostSettingControl
  | ListSettingControl;

export interface SettingsSectionDefinitionBase {
  /** The runtime namespaces this ID to the calling extension. */
  readonly id: SettingsSectionId;
  readonly title: string;
  readonly group?: string;
  readonly icon?: UiIcon;
  readonly order?: number;
  readonly isVisible?: (context: SettingsSectionRenderContext) => boolean;
  readonly searchEntries?: readonly {
    readonly id: string;
    readonly title: string;
    readonly keywords?: readonly string[];
  }[];
}

export interface SettingsControlsSectionDefinition
  extends SettingsSectionDefinitionBase {
  readonly content: "controls";
  readonly controls: readonly SettingControl[];
  readonly render?: never;
}

export interface SettingsRenderedSectionDefinition
  extends SettingsSectionDefinitionBase {
  readonly content: "render";
  readonly render: UiRenderProvider<SettingsSectionRenderContext>;
  readonly controls?: never;
}

export type SettingsSectionDefinition =
  | SettingsControlsSectionDefinition
  | SettingsRenderedSectionDefinition;

/**
 * Exact control-section shape used by a ChatGPT native settings owner.
 *
 * This shape omits candidate fields that the current native owner cannot
 * preserve. Use contribution discovery before registration because a future
 * exact-build adapter can report another supported definition shape.
 */
export type NativeSettingsGroupId =
  | "personal"
  | "integrations"
  | "coding"
  | "archived";

export interface NativeSettingsDestination {
  readonly sectionId: SettingsSectionId;
  readonly controlId?: string;
}

export interface NativeSettingControlBase {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly restartRequired?: boolean;
}

export interface NativeStoredSettingControlBase
  extends NativeSettingControlBase {
  readonly disabled?: boolean;
  readonly destination?: NativeSettingsDestination;
}

export interface NativeToggleSettingControl
  extends NativeStoredSettingControlBase {
  readonly type: "toggle";
  readonly settingKey: SettingKey;
  readonly defaultValue?: boolean;
}

export interface NativeTextSettingControl extends NativeStoredSettingControlBase {
  readonly type: "text";
  readonly settingKey: SettingKey;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly validate?: (value: string) => string | undefined;
}

export interface NativeSelectSettingOption {
  readonly value: string;
  readonly label: string;
}

export interface NativeSelectSettingControl
  extends NativeStoredSettingControlBase {
  readonly type: "select";
  readonly settingKey: SettingKey;
  readonly options: readonly NativeSelectSettingOption[];
  readonly defaultValue?: string;
}

export type NativeButtonSettingControl = NativeSettingControlBase & {
  readonly type: "button";
} & (
    | {
        readonly commandId: string;
        readonly destination?: NativeSettingsDestination;
        readonly disabled?: boolean;
      }
    | {
        readonly destination: NativeSettingsDestination;
        readonly commandId?: never;
        readonly disabled?: never;
      }
  );

export type NativeSettingControl =
  | NativeToggleSettingControl
  | NativeTextSettingControl
  | NativeSelectSettingControl
  | NativeButtonSettingControl;

export interface NativeSettingsControlsSectionDefinition {
  readonly id: SettingsSectionId;
  readonly title: string;
  readonly group?: NativeSettingsGroupId;
  readonly content: "controls";
  readonly controls: readonly NativeSettingControl[];
  readonly searchEntries?: readonly {
    readonly title: string;
    readonly keywords?: readonly string[];
  }[];
}

export type SettingsSectionDefinitionShape =
  | "native-controls"
  | "rendered";

export interface SettingsSectionRenderContext extends UiOwnerContext {
  readonly sectionId: SettingsSectionId;
  readonly hostId?: HostId;
}

export interface SettingChange {
  readonly key: SettingKey;
  readonly scope: SettingsScope;
  readonly value: SettingValue | undefined;
}

export interface SettingsSnapshot {
  readonly revision: number;
  readonly scope: SettingsScope;
  readonly values: JsonObject;
}

export interface SettingsApi {
  get<T extends SettingValue = SettingValue>(
    key: SettingKey,
    options?: SettingReadOptions,
  ): Promise<T | undefined>;
  set(key: SettingKey, value: SettingValue, options?: SettingWriteOptions): Promise<void>;
  delete(key: SettingKey, options?: SettingWriteOptions): Promise<void>;
  batch(values: JsonObject, options?: SettingWriteOptions): Promise<void>;
  listSections(options?: RequestOptions): Promise<readonly SettingsSection[]>;
  open(options?: SettingsOpenOptions): Promise<void>;
  events(scope: SettingsScope): EventSource<SettingChange, SettingsSnapshot>;
}
