# dsh-cua-macos

DeepSeek Harness bundle for the macOS Computer Use provider.

The bundle registers `@deepseek-ai/dsh-computer-use` and
`@deepseek-ai/dsh-experimental-cua-macos`.

The official provider package is downloaded from npm when this plugin is
installed. On first activation, the plugin compiles its bundled Swift source
with the local Xcode toolchain. The resulting helper is cached at:

```text
~/Library/Caches/dsh-cua-macos/<provider-version>/<architecture>/dsh-cua-native
```

No native source or binary is stored in this repository.

## Requirements

- macOS 14 or later on Apple silicon or Intel
- Xcode Command Line Tools (`xcode-select --install`)
- Accessibility and Screen Recording permission for DeepSeek Harness

## Install

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add \
  "github:jimyag/dsh-plugins#path:/dsh-cua-macos"
```

Restart DeepSeek Harness after installation. The first load may wait for the
Swift build to finish; later loads reuse the cached helper.

Set `DSH_CUA_CACHE_DIR` before starting DeepSeek Harness to use another cache
location.
