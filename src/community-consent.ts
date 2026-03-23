import { loadPreferencesV2, savePreferencesV2, type UserPreferencesV2 } from './preferences.js';

export function getCommunityChoiceLabel(prefs: UserPreferencesV2): string {
  if (!prefs.community_choice_made) return 'pending';
  return prefs.community_sharing ? 'manual uploads allowed' : 'local-only';
}

export function getCommunityHelpStatus(prefs: UserPreferencesV2): string {
  if (!prefs.community_choice_made) return 'choice pending (currently local-only)';
  return prefs.community_sharing ? 'enabled' : 'disabled (local-only chosen)';
}

export function getCommunityModeLabel(prefs: UserPreferencesV2): string {
  return prefs.community_sharing ? 'manual anonymized uploads allowed' : 'local-only';
}

export function renderCommunityConsentFlow(): string {
  return [
    'Choose your community mode:',
    '1. Keep everything private: `/eta community off`',
    '2. Allow manual anonymized uploads: `/eta community on`',
    '`/eta compare` stays read-only either way.',
    'You can change this later at any time.',
  ].join('\n');
}

export function consumeCommunityConsentPrompt(): string | null {
  const prefs = loadPreferencesV2();
  if (prefs.community_choice_made || prefs.community_consent_prompt_seen) return null;

  prefs.community_consent_prompt_seen = true;
  prefs.updated_at = new Date().toISOString();
  savePreferencesV2(prefs);
  return renderCommunityConsentFlow();
}

export function setCommunitySharingPreference(enabled: boolean): UserPreferencesV2 {
  const prefs = loadPreferencesV2();
  prefs.community_sharing = enabled;
  prefs.community_choice_made = true;
  prefs.community_consent_prompt_seen = true;
  prefs.updated_at = new Date().toISOString();
  savePreferencesV2(prefs);
  return prefs;
}
