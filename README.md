# DSH plugins

DeepSeek Harness plugins maintained in this repository.

## Plugins

| Plugin | Active tools |
| --- | --- |
| `dsh-codex-fast` | Unified model, reasoning effort and Fast control for GPT models |
| `dsh-codex-memory` | `codex_memory_search`, `codex_memory_list`, `codex_memory_read`, `codex_memory_note` |
| `dsh-shared-memory` | `memory_search`, `memory_list`, `memory_save`, `memory_forget`, `memory_pending`, `memory_read_source` |

## Requirements

- DeepSeek Harness `0.2.1-rc.3` or newer in the `0.2.x` line
- Node.js `22.19.0` or newer

## Install

Install one plugin into a DSH profile:

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"

"$DSH" plugin --profile desktop add \
  "github:jimyag/dsh-plugins#path:/dsh-codex-memory"

"$DSH" plugin --profile desktop add \
  "github:jimyag/dsh-plugins#path:/dsh-shared-memory"
```

Restart DeepSeek Harness after installing a plugin. `dsh plugin` forwards to
pnpm, so package dependencies are downloaded during installation.

To pin a specific revision, put the commit before the path:

```text
github:jimyag/dsh-plugins#<commit>&path:/dsh-codex-memory
```

## License

Repository-authored code is MIT. `dsh-codex-memory` includes templates derived
from OpenAI Codex and is distributed under Apache-2.0; see
`dsh-codex-memory/LICENSE` and `dsh-codex-memory/NOTICE`.

