import { type UserPreferencesV2 } from './preferences.js';
export declare function getCommunityChoiceLabel(prefs: UserPreferencesV2): string;
export declare function getCommunityHelpStatus(prefs: UserPreferencesV2): string;
export declare function getCommunityModeLabel(prefs: UserPreferencesV2): string;
export declare function renderCommunityConsentFlow(): string;
export declare function consumeCommunityConsentPrompt(): string | null;
export declare function setCommunitySharingPreference(enabled: boolean): UserPreferencesV2;
//# sourceMappingURL=community-consent.d.ts.map