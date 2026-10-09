/** Keys of admin-editable switches stored in PlatformSetting, with their initial values. */
export const PLATFORM_SETTING_DEFAULTS = {
  /** While true, new brands start on FREE_BETA instead of TRIAL (UC-B1). */
  isFreeBetaActive: true,
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTING_DEFAULTS;
