import type { TaskClassification, RunnerKind } from '../types.js';
import type { InsightResult } from '../insights/types.js';
interface ActiveTurnSummary {
    session_id: string;
    agent_key: string;
    classification: TaskClassification;
    runner_kind: RunnerKind;
    started_at: string;
    tool_calls: number;
}
export declare function buildAdminExport(pluginVersion: string): Promise<{
    generated_at: string;
    plugin_version: string;
    health: {
        plugin_version: string;
        uptime_since: string | null;
        uptime_days: number;
        total_turns_alltime: number;
        active_turns_count: number;
        active_turns: ActiveTurnSummary[];
        last_event_by_project: {
            project_fp: string;
            display_name: string;
            last_event_at: string;
            hours_since: number;
            stale: boolean;
        }[];
        stop_reasons: Record<string, number>;
        stop_failure_rate_pct: number;
    };
    eta_accuracy: {
        by_project_type: {
            project: string;
            classification: string;
            hits: number;
            misses: number;
            total: number;
            rate_pct: number;
        }[];
        global: {
            classification: string;
            hits: number;
            misses: number;
            total: number;
            rate_pct: number;
        }[];
        auto_disabled_types: string[];
    };
    data_quality: {
        by_project: {
            project: string;
            project_fp: string;
            total: number;
            this_week: number;
        }[];
        classification_distribution: {
            classification: string;
            count: number;
            pct: number;
        }[];
        type_coverage: {
            classification: string;
            count: number;
            auto_eta_eligible: boolean;
            robust: boolean;
        }[];
        time_ratios: {
            project: string;
            avg_wall_seconds: number;
            avg_active_seconds: number;
            avg_wait_seconds: number;
            wait_ratio_pct: number;
        }[];
        weekly_volume: {
            week: string;
            count: number;
        }[];
    };
    supabase: {
        available: boolean;
        error: string | null;
        baselines_count?: undefined;
        last_baseline_refresh?: undefined;
        types_with_baselines?: undefined;
        total_community_samples?: undefined;
    } | {
        available: boolean;
        baselines_count: number;
        last_baseline_refresh: string | null;
        types_with_baselines: string[];
        total_community_samples: number;
        error?: undefined;
    };
    insights: InsightResult[];
    subagents: {
        main_turns: number;
        subagent_turns: number;
        ratio: number;
        median_main_seconds: number;
        median_subagent_seconds: number;
        by_agent_type: {
            agent_type: string;
            count: number;
            median_seconds: number;
        }[];
    };
}>;
export declare function showAdminExport(pluginVersion: string): Promise<void>;
export {};
//# sourceMappingURL=admin-export.d.ts.map