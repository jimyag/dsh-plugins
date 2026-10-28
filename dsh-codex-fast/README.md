# GPT Fast for DeepSeek Harness

在 GPT 模型的会话输入框中添加 Fast 按钮；非 GPT 模型不显示。开启时使用暖色胶囊和实心闪电，关闭时显示低强调的文字与线框闪电。

![Fast 控件](docs/fast-control.png)

也支持 `/fast`、`/fast on`、`/fast off` 和 `/fast status`。设置按会话保存，新会话默认关闭，推理强度独立选择。

## 安装

把本目录作为本地插件安装到 DSH desktop profile，再启用 `dsh-codex-fast`。插件组合包只插入自己的 `codex-fast` 条目。

保留原 `llm-pi-ai` 插件和 `config.providers`。Magpie 继续维护原来的模型列表、连接地址和默认模型；不需要迁移 provider，不修改 DSH 或 Magpie 的程序文件。

要求 DSH 0.2.x、Node.js 22.19 或更新版本，以及宿主提供的 Loader、Storage Domain、Commands、Session Controller 与 Connection 接口。配置 Schema 和存储验证依赖由宿主提供。

## 请求范围

插件在自身生命周期内包装宿主的 `fetch`，只处理同时满足以下条件的请求：

- 目标与原适配器配置中的 OpenAI Chat Completions 或 Responses 端点完全匹配。
- 模型 ID 属于 GPT，包括 Codex、WorkBuddy、远程 Magpie 和分组路由中的 GPT。
- 请求来自 DSH 公开的 `llm/stream` 中间件；插件通过独立的异步上下文取得会话、provider 和模型，覆盖普通调用与 prepared 调用。
- 此会话开启 Fast，且原适配器的请求模型、provider 和目标端点一致。

只有这些请求会增加顶层 `service_tier: "priority"`。其他请求原样传递。模型选择、推理参数、图片转换和加密推理回放继续由原适配器处理。Fast 状态在请求开始时捕获，迭代、取消和异常清理保持同一请求上下文，不会因另一个会话切换开关而改变。

卸载时恢复原请求函数；已经被 SDK 客户端保存的旧钩子也会变为透传，避免重试时读取已关闭的状态存储。

状态保存在 `codex_fast` Storage Domain，不写入模型上下文。按钮在保存成功后才更新；接口不可用时不会将 404 文本直接当 JSON 解析。非 GPT 模型不显示按钮，无法确定可用端点的 GPT 路由会显示不可用提示。

## 核验

```sh
node --test test/fast.test.js
node --check src/index.js
node --check client.js
```

行为测试通过真实本机 HTTP 接收端核对 Chat Completions 与 Responses 的请求内容、会话隔离、推理和回放内容保留、其他模型与端点透传，以及卸载后的旧客户端行为。

交付前还需在当前 DSH 页面验证 GPT 按钮显示、非 GPT 隐藏、实际开关、刷新持久性与真实请求。区分 Magpie 的 `tier_sent` 与 `tier_served`：发送 Priority 只表明请求选择，实际服务等级由上游决定。若 Magpie 对客户端或路由组设置了强制 Fast，也可能覆盖 DSH 关闭状态下的普通请求。
