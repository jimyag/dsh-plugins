# dsh-codex-memory

Codex-aligned memory pipeline for DeepSeek Harness.

## Layout

The plugin uses Codex's memory workspace names:

```text
~/.codex/memories_v2/
  memory_summary.md
  rollout_summaries/
  extensions/ad_hoc/notes/
  .git/
```

V1 uses `~/.codex/memories` and additionally reads and writes `MEMORY.md` and
`raw_memories.md`.

V2 intentionally does not create `MEMORY.md` or `raw_memories.md`. Its durable
consolidated artifact is `memory_summary.md`.

## Codex Alignment

- DSH session IDs are mapped to stable UUIDv7 Codex thread IDs. The mapping is
  stored in the plugin state file.
- Rollout summary filenames use Codex's UUID timestamp, low-32-bit base62 hash,
  60-character slug, and metadata/body format.
- Phase 1 uses Codex's V1 or V2 schema. V2 requires only `rollout_summary` and
  `rollout_slug`; V2 rollout summaries are bounded to 9,000 UTF-8 bytes.
- V1 `raw_memories.md` uses Codex's stable ascending thread-id order and exact
  metadata format.
- Phase 2 writes a git-based `phase2_workspace_diff.md`, lets the consolidation
  agent edit the memory workspace, validates the artifacts, then replaces the
  baseline with a fresh one-commit repository.
- V2 summaries must start with `v1`, stay below 10,000 UTF-8 bytes, and contain
  `## User Profile`, `## User preferences`, `## General Tips`, and
  `## What's in Memory`.
- Phase 2 selection ranks memories by `usage_count`, then last usage or source
  update time, and applies `max_unused_days`.
- Citations in assistant messages update `usage_count` and `last_usage`.
- The injected prompt is Codex's V1 or V2 memory read-path prompt.

## Shared Codex Workspace

DSH does not have access to Codex's SQLite stage-1 index. Applying Codex's
rollout pruning directly would therefore delete valid Codex-generated rollout
files that DSH cannot see.

To avoid data loss:

- The plugin prunes only rollout summary files recorded as DSH-owned in its
  state. Existing Codex rollout files are preserved.
- An existing unmanaged V1 `raw_memories.md` is never overwritten. V1 generation
  fails closed; use V2 when sharing an existing Codex workspace.
- Phase 2 takes the same sibling workspace lock used by Codex
  (`memories_v2.lock`) on macOS, so one process cannot consolidate while the
  other owns the workspace.

This ownership guard is a deliberate DSH adaptation. Codex itself can still
prune DSH-generated rollout files during its own later consolidation because
those files are absent from Codex's SQLite index.

## Behavior

- Injects a bounded `memory_summary.md` into root-agent system prompts.
- Registers `codex_memory_search`, `codex_memory_list`, `codex_memory_read`, and
  `codex_memory_note`.
- Scans persisted root sessions after the configured idle window.
- Runs Phase 1 extraction concurrently and tracks lease/retry state in
  `~/.dsh/codex-memory/state.json`.
- Runs Phase 2 in the memory root with Codex's consolidation prompt.
- Uses a DSH `spawn` subagent for both phases and consumes model tokens in the
  background.

## Install

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add \
  "link:/Users/jimyag/src/github.com/jimyag/dsh-plugins/dsh-codex-memory"
```

## Configuration

Defaults select `$CODEX_HOME/memories_v2`, then fall back to
`$CODEX_HOME/memories`:

```yaml
- id: dsh-codex-memory
  config:
    version: v2
    root: /absolute/path/to/memories_v2
    autoInject: true
    autoGenerate: true
    includeSubagents: false
    summaryMaxChars: 12000
    maxScanSessions: 5000
    maxRolloutsPerStartup: 2
    maxRolloutAgeDays: 10
    minRolloutIdleHours: 6
    maxUnusedDays: 30
    maxRawMemoriesForConsolidation: 256
    phase1Concurrency: 8
    maxSessionChars: 60000
    phase1MaxTokens: 6000
    phase2MaxTokens: 16000
    phase1ReasoningEffort: null
    phase2ReasoningEffort: null
    subagentProvider: spawn
```

`version` is `v1` or `v2`. If `root` is provided without `version`, the plugin
infers V1 only when the final directory is named `memories`.

## Limitations

- Codex's SQLite job table is represented by JSON leases and watermarks, not by
  the same database transaction semantics.
- DSH subagents cannot receive Codex's exact Phase 2 sandbox/tool lockdown.
  The prompt forbids recursive delegation and network use, but DSH permissions
  are inherited from the parent.
- DSH session events are serialized into Codex-like rollout evidence rather than
  using Codex's exact `RolloutItem` representation.
- Citation usage is parsed from the final assistant text. Codex's internal
  typed citation event is not available through the DSH session projection.

## Test

```sh
node --test
```
