# dsh-ego-lite

DeepSeek Harness tool over the installed ego lite browser runtime.

## Tool

`ego_browser` supports:

- `skill`: print the guide for the installed ego-browser version.
- `help`: print help for one topic, such as `page.click`.
- `version`: print the installed runtime version.
- `run`: execute one complete Node.js round by sending the script to
  `ego-browser nodejs` over stdin.

Each `run` is a new process. Task spaces, pages, and browser tabs persist; local
JavaScript variables do not. The tool rejects shell interpolation by invoking
`ego-browser` with `execFile`.

## Install

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add \
  "link:/Users/jimyag/src/github.com/jimyag/dsh-plugins/dsh-ego-lite"
```

The default binary is `~/.local/bin/ego-browser`. Override it with `binary` in
`cordis.patch.yml` or the `EGO_BROWSER_BIN` environment variable.

## Verify

```sh
node --check src/index.js
node --test
```

The native runtime can be checked without a model request:

```sh
ego-browser --version
ego-browser skill
```
