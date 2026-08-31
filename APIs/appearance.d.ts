import type { Disposable } from "./core.js";

/** ChatGPT's resolved application appearance. */
export type AppearanceColorScheme = "light" | "dark";

/** CSS custom properties that ChatGPT already uses for its header surfaces. */
export type HeaderCssProperty =
  | "--header-background-color"
  | "--header-foreground-color";

/** Light and dark values for one header property. */
export interface HeaderThemeColor {
  readonly light: string;
  readonly dark: string;
}

/** A complete replacement for one registration's current header properties. */
export type HeaderCssProperties = Readonly<
  Partial<Record<HeaderCssProperty, HeaderThemeColor>>
>;

/** The effective extension-provided colors for the current appearance. */
export type ResolvedHeaderCssProperties = Readonly<
  Partial<Record<HeaderCssProperty, string>>
>;

export interface HeaderCssPropertiesRegistration extends Disposable {
  /** Replace this registration's values without changing its precedence. */
  update(properties: HeaderCssProperties): void;
}

/** ChatGPT's thread header and side-panel tab-header appearance seam. */
export interface HeaderAppearanceApi {
  /**
   * Register header properties. Registrations compose in order and the last
   * active value for each property wins. An empty object keeps native colors.
   */
  registerProperties(
    properties: HeaderCssProperties,
  ): HeaderCssPropertiesRegistration;

  /** Return extension-provided values resolved for the current appearance. */
  getProperties(): ResolvedHeaderCssProperties;
}

export interface ColorPickerOptions {
  readonly initialColor: `#${string}`;
  readonly title: string;
  readonly onChange: (color: `#${string}`) => void;
}

/** One queued or visible instance of ChatGPT's native color picker. */
export interface ColorPickerSession extends Disposable {
  /** Confirmed color, or `undefined` after dismissal or disposal. */
  readonly result: Promise<`#${string}` | undefined>;
}

/** Native appearance functions that are already present in ChatGPT. */
export interface AppearanceApi {
  readonly header: HeaderAppearanceApi;
  getColorScheme(): AppearanceColorScheme;
  openColorPicker(options: ColorPickerOptions): ColorPickerSession;
}
