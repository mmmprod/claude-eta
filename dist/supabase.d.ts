/**
 * Zero-dependency Supabase REST client for claude-eta.
 * Uses raw fetch against the PostgREST API. No SDK needed.
 */
interface SupabaseResponse<T> {
    data: T | null;
    error: string | null;
}
/** INSERT rows into velocity_records. Returns error string or null on success. */
export declare function insertVelocityRecords(records: object[]): Promise<SupabaseResponse<null>>;
export interface BaselineRecord {
    task_type: string;
    project_loc_bucket: string | null;
    model: string | null;
    sample_count: number;
    median_seconds: number;
    p25_seconds: number;
    p75_seconds: number;
    p10_seconds: number;
    p90_seconds: number;
    avg_tool_calls: number | null;
    avg_files_edited: number | null;
    volatility: 'low' | 'medium' | 'high' | null;
    computed_at: string;
}
/** SELECT all rows from baselines_cache. */
export declare function fetchBaselines(): Promise<SupabaseResponse<BaselineRecord[]>>;
export {};
//# sourceMappingURL=supabase.d.ts.map