export interface UserPreferencesV2 {
    auto_eta: boolean;
    community_sharing: boolean;
    prompts_since_last_eta: number;
    last_eta_task_id: string | null;
    updated_at: string;
}
export declare function loadPreferencesV2(): UserPreferencesV2;
export declare function savePreferencesV2(prefs: UserPreferencesV2): void;
//# sourceMappingURL=preferences.d.ts.map