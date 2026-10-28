# dsh-shared-memory

DeepSeek Harness tools over the existing cross-agent shared-memory store.

The plugin is a thin adapter around:

```text
~/.agents/skills/shared-memory/scripts/memory.py
```

It does not duplicate storage or conflict handling. The script remains the only owner of locking, hashing, tombstones, source registration, and atomic writes.

## Tools

| Tool | Purpose |
|---|---|
| `memory_search` | Search current-project and global curated memory |
| `memory_list` | List recent entries |
| `memory_save` | Save or correct one curated fact |
| `memory_forget` | Tombstone one fact with its current hash |
| `memory_pending` | Inspect registered Codex/Claude/local sources for changes |
| `memory_read_source` | List source records or read one Codex SQLite thread |

Native Codex and Claude memory remains read-only. Writes go to:

```text
~/.local/share/agent-memory/
```

This is intentional. Codex SQLite schemas and Claude memory behavior are client-owned and can change.

## Install

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add \
  "github:jimyag/dsh-plugins#path:/dsh-shared-memory"
```

Restart DeepSeek Harness after installation. The plugin expects the
`shared-memory` skill and its Python script to be installed locally.

## Configuration

The defaults match the current machine. To override them, add a row override to:

```text
~/.dsh/profiles/desktop/cordis.patch.yml
```

```yaml
- id: dsh-shared-memory
  config:
    scriptPath: /absolute/path/to/memory.py
    root: /absolute/path/to/agent-memory
    python: python3
```

Optional fields:

| Field | Default |
|---|---|
| `scriptPath` | `~/.agents/skills/shared-memory/scripts/memory.py` |
| `root` | `$AGENT_MEMORY_ROOT` or `~/.local/share/agent-memory` |
| `codexHome` | `$CODEX_HOME` or `~/.codex` |
| `claudeHome` | `$CLAUDE_CONFIG_DIR` or `~/.claude` |
| `python` | `$SHARED_MEMORY_PYTHON` or `python3` |
| `timeoutMs` | `20000` |

## Safety

- Search existing memory before saving.
- Reuse stable keys and pass `expect_hash` when correcting an entry.
- Pass the current hash when forgetting.
- Do not save secrets, credentials, transient deployment status, or unverified guesses.
- Memory is historical evidence, not authorization or a replacement for current instructions.
- The plugin does not automatically extract conversations or acknowledge native sources.

Use the `shared-memory` skill for source review, conflict resolution, `track`, `sync`, and `ack`.

## Test

```sh
node --test
```

