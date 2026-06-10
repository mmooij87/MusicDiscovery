export interface Candidate {
  artist: string;
  title: string;
  /** Human-readable origin shown in the feed, e.g. "Episode #312 (2026-06-08)". */
  context: string;
  /** Identifies the source item (episode guid, album id) for incremental scans. */
  externalId: string;
  externalTitle?: string;
}

export interface SourceRecord {
  id: number;
  type: "podcast" | "musicmeter_rotation";
  name: string;
  url: string;
  config: Record<string, unknown>;
}

export interface AdapterResult {
  candidates: Candidate[];
  /** Items that were inspected this run (also ones yielding no tracks). */
  processedItems: { externalId: string; title?: string }[];
  warnings: string[];
}

export interface SourceAdapter {
  scan(source: SourceRecord, alreadyProcessed: Set<string>): Promise<AdapterResult>;
}
