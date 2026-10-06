/** EN: Define capture inputs, artifacts and reconciliation units; optional fields do not establish extraction coverage.
 * ZH: 定义采集输入、产物及对账单位；字段存在不代表已证明提取覆盖率。 */
/** EN: Define the AdapterTab contract or operation in this module.
 * ZH: 定义本模块的 AdapterTab 契约或操作。 */
export interface AdapterTab {
    id: string;
    labels: string[];
}
/** EN: Define the EndpointContract contract or operation in this module.
 * ZH: 定义本模块的 EndpointContract 契约或操作。 */
export interface EndpointContract {
    id: string;
    method: string;
    path: string;
    min: number;
}
/** EN: Define the CaptureAdapter contract or operation in this module.
 * ZH: 定义本模块的 CaptureAdapter 契约或操作。 */
export interface CaptureAdapter {
    schema: number;
    adapter_id: string;
    updated_at: string;
    origin: string;
    record_path: string;
    record_list_url: string;
    record_queue: {
        stage_title: string;
        list_endpoint: string;
        page_size: number;
        safety_page_cap: number;
    };
    page_asset_hosts: string[];
    external_ai_blocked_hosts: string[];
    root_tabs: AdapterTab[];
    dynamic: {
        history_labels: string[];
        filter_labels: string[][];
        mail_labels: string[];
        next_labels: string[];
        trail_endpoint: string;
        mail_info_endpoint: string;
        mail_track_endpoint: string;
        mail_module_values: string[];
        visible_page_cap: number;
        safety_page_cap: number;
    };
    documents: {
        list_endpoint: string;
        folder_endpoint: string;
        next_labels: string[];
        visible_page_cap: number;
        safety_page_cap: number;
    };
    expected_endpoint_contracts: EndpointContract[];
    known_count_paths: Record<string, string[]>;
}
export type JobPhase = "idle" | "preflight" | "root" | "tabs" | "mail" | "documents" | "reconcile" | "complete" | "incomplete" | "failed" | "cancelled";
/** EN: Define the JobStatus contract or operation in this module.
 * ZH: 定义本模块的 JobStatus 契约或操作。 */
export interface JobStatus {
    id: string | null;
    phase: JobPhase;
    running: boolean;
    progress: number;
    headline: string;
    detail: string;
    recordId: string | null;
    caseRoot: string | null;
    sessionRoot: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    errors: string[];
    warnings: string[];
    metrics: Record<string, number | string | boolean | null>;
}
/** EN: Define the StoredResponse contract or operation in this module.
 * ZH: 定义本模块的 StoredResponse 契约或操作。 */
export interface StoredResponse {
    sequence: number;
    method: string;
    url: string;
    path: string;
    status: number;
    resourceType: string;
    mimeType: string;
    bodyRelativePath: string | null;
    bodySha256: string | null;
    bodyBytes: number | null;
    requestBodySha256?: string | null | undefined;
    json: unknown | null;
    error: string | null;
    responseHeaders?: Record<string, string> | undefined;
    statusText?: string | undefined;
    serverAddress?: {
        ipAddress: string;
        port: number;
    } | null | undefined;
    securityDetails?: Record<string, unknown> | null | undefined;
    timing?: Record<string, number> | undefined;
    fromServiceWorker?: boolean | undefined;
}
/** EN: Define the ReconciliationCheck contract or operation in this module.
 * ZH: 定义本模块的 ReconciliationCheck 契约或操作。 */
export interface ReconciliationCheck {
    id: string;
    title: string;
    status: "pass" | "fail" | "warning" | "not_observed";
    expected: unknown;
    actual: unknown;
    evidence: string[];
    detail: string;
}
