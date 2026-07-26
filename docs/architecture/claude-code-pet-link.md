# Codress 桌宠 × Claude Code 状态联动 — 设计方案

> 结论先行：**可以接入，但方向和 Codex 相反**。Claude Code 没有宠物/形象自定义系统（愚人节彩蛋 `/buddy` 已下线），所以不能像 Codex 那样"把宠物装进去"；正确姿势是反向——用 Claude Code 官方 **hooks** 把每个会话的工作状态实时推给 Codress 桌宠，桌宠用现有 Codex v2 图集里的 `running / waiting / failed / review` 等动画行做状态渲染。hooks 是稳定公开的扩展点，mac / Windows 双平台可用，可一键接入、一键卸载。

## 0. 背景事实（2026-07 调研）

| 事实 | 依据 |
|---|---|
| Claude Code 没有宠物系统，也没有形象自定义入口 | 当前版 v2.1.220 二进制全量字符串扫描无任何实现；官方文档（llms.txt / slash-commands）无条目 |
| `/buddy` 是 2026-04-01 愚人节限时彩蛋（v2.1.89，npm 发布于 2026-03-31 23:32 UTC，"hatch a small creature that watches you code"），之后被静默移除 | CHANGELOG 全文唯一一条记录 + 当前版无代码 |
| 与 Codex 接入模式的区别 | Codex：把皮肤**装进对方**（`~/.codex/pets/<slug>/` + `config.toml` 的 `selected-avatar-id`）；Claude Code：把状态**引到桌宠**（hooks → 本地桥） |

两条路线平行共存：宠物住在桌面（Codress 自己的透明窗），同时感知一个或多个编码 Agent 的状态。若官方 `/buddy` 未来回归并开放自定义，再按 `pet-installer.ts` 的模式加一个适配器即可（见 §10 M4）。

## 1. 总体架构

```
Claude Code（任意终端 / 任意项目 / 多会话并行）
  └─ hooks（用户级 ~/.claude/settings.json）
       └─ ~/.codress/bin/claude-hook.{cmd,sh} <事件名>     ← stdin 收到 hook JSON
            └─ curl POST http://127.0.0.1:<port>/v1/agent-events   （X-Codress-Token）
                 └─ AgentLinkBridge（Electron main，仅监听 127.0.0.1）
                      └─ AgentStateAggregator（会话表 / 优先级 / TTL / 防抖）
                           └─ PetManager.setAgentState() → IPC "pet:agent-state"
                                └─ pet.html 状态机 → spritesheet 行切换
```

新增组件（全部在 desktop 端，服务端零改动）：

| 组件 | 位置 | 职责 |
|---|---|---|
| `AgentLinkBridge` | `src/main/agent-link/bridge.ts` | 本地 HTTP 单端点，token 校验，事件瘦身（见 §9） |
| `AgentStateAggregator` | `src/main/agent-link/aggregator.ts` | 会话注册表、状态优先级、TTL 兜底，输出唯一"桌宠应显状态" |
| `ClaudeHookInstaller` | `src/main/agent-link/claude-installer.ts` | 写脚本、合并/卸载 hooks（角色对标现有 `pet-installer.ts`） |
| `PetManager` 扩展 | `src/main/pets.ts` | `setAgentState()` → `webContents.send`；上桌时补发当前状态 |
| pet.html 状态机 | `src/renderer/pet.html` | 外部状态驱动替代现有固定轮播；瞬态动画队列 |
| 接入 UI | `src/renderer/src/pages/Mine.tsx` | 「编码助手联动」卡片（检测/接入/状态/断开） |

## 2. Claude Code 侧：hooks 接法

写入**用户级** `~/.claude/settings.json`（Windows 为 `%USERPROFILE%\.claude\settings.json`）的 `hooks` 字段，共 10 类事件（`PermissionRequest / PermissionDenied / PostToolUseFailure` 是取消与失败语义的关键，见 §3）：

```jsonc
{
  "hooks": {
    "SessionStart":       [{ "hooks": [{ "type": "command", "command": "<HOOK> SessionStart",       "timeout": 3 }] }],
    "UserPromptSubmit":   [{ "hooks": [{ "type": "command", "command": "<HOOK> UserPromptSubmit",   "timeout": 3 }] }],
    "PreToolUse":         [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<HOOK> PreToolUse",  "timeout": 3 }] }],
    "PostToolUse":        [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<HOOK> PostToolUse", "timeout": 3 }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "<HOOK> PostToolUseFailure", "timeout": 3 }] }],
    "PermissionRequest":  [{ "hooks": [{ "type": "command", "command": "<HOOK> PermissionRequest",  "timeout": 3 }] }],
    "PermissionDenied":   [{ "hooks": [{ "type": "command", "command": "<HOOK> PermissionDenied",   "timeout": 3 }] }],
    "Notification":       [{ "hooks": [{ "type": "command", "command": "<HOOK> Notification", "timeout": 3 }] }],
    "Stop":               [{ "hooks": [{ "type": "command", "command": "<HOOK> Stop",        "timeout": 3 }] }],
    "SessionEnd":         [{ "hooks": [{ "type": "command", "command": "<HOOK> SessionEnd",  "timeout": 3 }] }]
  }
}
```

`<HOOK>` = 平台脚本绝对路径：Windows `%USERPROFILE%\.codress\bin\claude-hook.cmd`，macOS `~/.codress/bin/claude-hook.sh`。

脚本职责一句话：把 stdin 的 hook JSON POST 给本地桥，1 秒超时，**任何情况都 exit 0**——Codress 没开、端口不在、curl 缺失，都绝不拖慢或阻塞 Claude Code。

`claude-hook.sh`（macOS）：

```sh
#!/bin/sh
# Codress agent-link hook — forward Claude Code hook JSON to the local bridge.
P="$HOME/.codress/bridge.port"; T="$HOME/.codress/bridge.token"
[ -f "$P" ] && [ -f "$T" ] || exit 0
curl -s --max-time 1 -X POST \
  "http://127.0.0.1:$(cat "$P")/v1/agent-events?event=$1&src=claude-code" \
  -H "X-Codress-Token: $(cat "$T")" -H "Content-Type: application/json" \
  --data-binary @- >/dev/null 2>&1
exit 0
```

`claude-hook.cmd`（Windows）：

```bat
@echo off
if not exist "%USERPROFILE%\.codress\bridge.port" exit /b 0
if not exist "%USERPROFILE%\.codress\bridge.token" exit /b 0
set /p PORT=<"%USERPROFILE%\.codress\bridge.port"
set /p TOKEN=<"%USERPROFILE%\.codress\bridge.token"
curl -s --max-time 1 -X POST "http://127.0.0.1:%PORT%/v1/agent-events?event=%1&src=claude-code" -H "X-Codress-Token: %TOKEN%" -H "Content-Type: application/json" --data-binary @- >nul 2>&1
exit /b 0
```

**端口与令牌**：`~/.codress/bridge.port`、`~/.codress/bridge.token` 是两个单值文件，由 Codress 启动时写入。端口被占时换端口只重写这两个文件，`settings.json` 里的 hooks **永不过期**（这是"脚本间接寻址"而非把端口烧死在 hooks 命令里的原因）。

> ⚠️ **实现前必测**：Windows 上 hook command 的宿主 shell（cmd / PowerShell / git-bash）。用一条探针 hook（`echo %COMSPEC%` vs `echo $0`）实测一次；若是 POSIX shell 则 Windows 也装 `.sh`（git-bash 自带 curl）。方案对两种结果都兼容，只影响装哪份脚本。

### 2.1 作用域与生效时机（全局，而非项目级）

- **全局生效**：hooks 写在用户级 `~/.claude/settings.json`，对本机**所有项目、所有会话**生效。桌宠是"机器级伙伴"，要的正是这个语义——不管在哪个仓库里使唤 Claude，宠物都有反应。
- **为什么不写项目级**：`.claude/settings.json` 会随仓库提交，等于把指向本机 `~/.codress` 的 hooks 塞进同事的环境（同事没装 Codress → 脚本不存在 → 每次工具调用都报 hook 失败），**绝对禁止**；`.claude/settings.local.json` 不入库，但要每个项目写一遍，换个目录就失联，维护成本不可接受。
- **层级叠加不冲突**：Claude Code 的 hooks 跨层级合并执行（用户级、项目级各自的条目都会跑）。用户某项目里已有的 hooks 与我方全局条目互不影响、互不覆盖。
- **想让某个项目"静音"**：不在 hooks 层做减法（项目级配置只能新增、不能移除用户级 hooks），而是在 Codress 聚合器按 cwd 做**忽略名单**——UI 提供「忽略此项目」，可逆、不碰用户配置文件（见 §4）。
- **生效时机**：Claude Code 在会话启动时快照 hooks 配置（安全设计，防止运行中的会话被外部注入命令）。因此接入后**新开的会话立即生效；已在运行的会话要重启**（或在 `/hooks` 菜单里确认加载）后才会驱动宠物。

## 3. 事件 → 桌宠状态映射（"像 Codex 那样"）

pet.html 现有 Codex v2 图集行（`ROWS`）直接复用，一行代码都不用改美术：

| Claude Code 事件 | 语义 | 聚合状态 | 图集行（spritesheet 宠物） | 单图宠物降级 |
|---|---|---|---|---|
| `SessionStart` | 会话开启 | greet（瞬态 1.5s） | `waving` | bounce |
| `UserPromptSubmit` | 用户发话，开始干活 | `running` | `running` / `running-left/right` | walk |
| `PreToolUse` / `PostToolUse` | 工具调用（高频心跳） | `running`（续期） | 同上 | walk |
| `PostToolUseFailure`（或 tool_response 含错误） | 工具失败 | failed（瞬态 1.5s） | `failed` | bounce |
| `PermissionRequest` | 权限弹窗出现 | `waiting` | `waiting` | idle |
| `PermissionDenied` | **用户拒绝/取消权限** | 等待解除 → `idle`（回合若继续，下一个工具事件毫秒级切回 running） | — | — |
| `Notification`（`idle_prompt` 类型） | 闲置提醒 = 没有活跃回合 | `running` 会话归位 `idle`；waiting（权限仍挂着）不受影响 | — | — |
| `Notification`（其他类型） | 等权限确认 / 需要输入 | `waiting` | `waiting` | idle |
| `Stop` | 回合完成 | celebrate（瞬态 2s）→ idle | `jumping` → `idle` | bounce → idle |
| `SessionEnd` | 会话结束 | 注销该会话 | — | — |
| 检测到 review 类技能（可选彩蛋） | 代码评审中 | `review` | `review` | walk |

**取消与中断语义**（重要）：用户按 Esc 中断回合时 **`Stop` 不触发**（官方语义：正常完成才算 Stop），所以取消依赖三层信号——① 权限弹窗上的拒绝/取消走 `PermissionDenied`，即时解除 waiting；② 中断 running 后没有专属 hook，靠 `idle_prompt` 闲置通知（默认约 60s）把该会话归位 idle；③ 两者都丢失时由心跳/TTL 兜底（见下）。归位一律安静进行，不播庆祝。

**TTL 兜底**（进程被杀、hook 丢失都不会卡死状态）：
- `running` 120s 无心跳 → 该会话自动回 `idle`
- **waiting**：取消路径已由 `PermissionDenied` 即时解除；TTL 只兜"终端被直接杀掉"的幽灵会话——waiting 会话保留 10 分钟，用户一旦处理（批准/继续输入），下一个事件自然把它切回 running
- 非 waiting 会话 5 分钟无任何事件 → 从会话表移除
- 瞬态状态（greet/failed/celebrate）播完自动回落到当前持久状态
- Codress 重启后会话表清空，状态随下一个事件重建（waiting 中的会话要等下一次权限事件才重新出现，可接受）

## 4. 多来源 / 多会话冲突（聚合策略）

数据结构：`sessions: Map<"${src}:${session_id}", { src, state, lastSeen, cwd }>`

- **展示优先级**：`failed > waiting > running > review > celebrate > idle`。waiting 压过 running——"有会话在等你"比"别的会话还在跑"更值得被看见。
- **多会话**：任一 waiting → waiting；否则任一 running → running。名牌 hover 显示计数（"Claude Code ×2 工作中 · 1 个在等确认"）。

并发场景速查（宠物只有一个身体，动画取聚合态；明细分流到气泡 / 名牌 / 点击列表三层）：

| 并发情形 | 宠物动画 | 气泡 | 名牌 hover |
|---|---|---|---|
| A 跑 + B 跑 | running | 无 | Claude Code ×2 工作中 |
| A 跑 + B 等确认 | waiting | `<B 项目名> 在等你` | 1 工作中 · 1 等确认 |
| A 等 + B 等 | waiting | `2 个会话在等你` | 2 等确认 |
| A 跑 + B 完成（Stop） | running（**不庆祝**） | 无 | 1 工作中 |
| 最后一个活跃会话完成 | celebrate → idle | `搞定！`（2s） | 全部空闲 |
| A 跑 + B 工具报错 | failed 闪 1.5s → running | `工具出错了`（1.5s） | 1 工作中 |

- **庆祝只属于收尾**：某会话 Stop 时若还有其他会话在跑/在等，不播 celebrate（避免"庆祝完又继续跑"的精神分裂）；只有最后一个活跃会话完成才庆祝。
- **气泡文案选主**：单个 waiting 显示该会话项目名；多个 waiting 显示计数，点击气泡展开列表（按等待时长排序：项目名 · 状态 · 已等多久）。
- **同类不排序**：多个同为 running 的会话对动画无差别，只进计数。
- **多来源**：`src` 字段天然隔离（`claude-code` / 未来 `codex-cli`、`workbuddy`…），每来源独立开关，聚合规则来源无关——这就是"避免多平台冲突"的答案：**不比大小，先比状态类别，同类看时间戳，全部过 TTL**。
- **与"装进 Codex"共存**：互不影响（一个是 Codex 应用内形象，一个是 Codress 桌面窗口）。两处都开会看到两只宠物 → 接入页放一句提示文案即可，不做强约束。
- **手动模式**：联动总开关关闭 → 桌宠回到现状（固定脚本轮播）；bridge 照常收事件但不驱动动画。
- **项目忽略名单**：聚合器按 cwd 匹配忽略名单（见 §2.1），被忽略项目的事件照收但不驱动动画、不计入名牌计数——"某个项目静音"在 Codress 侧解决，不碰 Claude 配置。
- **防抖**：状态最小保持 800ms；瞬态动画完整播完再切；状态切换走 IPC（`pet:agent-state`）不走页面 reload（`loadedPetKey` 机制保持不变）。

## 5. 交互设计（用户视角）

典型一天：

1. 开机，宠物待机呼吸/轮播（现状不变）
2. 终端里 `claude` 发问 → 宠物立刻小跑（running）
3. Claude 请求权限 → 宠物停下举手张望（waiting），头顶弹出气泡「等你确认 · <项目名>」（默认开启，规范见 §5.1）
4. 批准后继续小跑；工具报错时 failed 表情闪 1.5s
5. 回合结束 → 跳一下庆祝 → 回待机

交互细节：

- **名牌**（现有 hover `.name`）加第二行状态摘要："Claude Code 工作中 ×2"
- **waiting 时点击宠物** → 打开 Codress 主窗并列出等待中的会话（项目名取 cwd basename）。不承诺"聚焦到对应终端"——跨平台做不可靠，诚实不许诺。
- **右键菜单**追加一项：`联动：Claude Code ✓`（点击切换暂停/恢复）；现有"打开 Codress / 下桌"不动
- **不发系统通知**：Claude Code 自带终端提醒，桌宠只做视觉表达，避免双重打扰

### 5.1 气泡：默认开启的正式组件

定位：**动画表达情绪，气泡承载语义**。宠物只有 150px，waiting 是唯一"错过了就浪费真实时间"的状态（Claude 卡在权限确认上等人），所以气泡默认开启（设置保留总开关），是 waiting 的第一信息载体。

| 状态 | 出泡 | 文案 | 存续 |
|---|---|---|---|
| waiting | ✅ 持久 | `等你确认 · <项目名>`；多会话 `2 个会话在等你` | 到状态解除 |
| failed | ✅ 瞬态 | `工具出错了` | 1.5s |
| celebrate | ✅ 瞬态 | `搞定！` | 2s |
| running / idle / greet | ❌ | 信息放 hover 名牌，避免常驻噪音 | — |

行为规则：

- 位置在宠物头顶（窗口顶部条，与 hover 名牌同区）；气泡活跃时名牌让位——气泡本身已含状态语义。
- **点击气泡** = waiting 快捷入口：打开 Codress 主窗并定位到等待会话列表（与"waiting 时点击宠物"同一动作）。
- 状态解除自动消失；点宠物本体可收起本次气泡（snooze：同一次等待内不再弹，下次 waiting 重新出现）。
- 防闪烁：waiting 持续不足 1.5s 不弹；状态切换沿用 §4 的 800ms 防抖；拖拽中隐藏（与右键菜单同规则）。
- 布局约束：窗口 180×200、宠物占底部 150px，顶部条约 40px → 文案上限约 12 个全角字符，超长省略号；**不加宽窗口**——透明窗整个矩形都拦截鼠标，窗口越大越挡桌面点击。
- `prefers-reduced-motion`：气泡照常显示（它是信息不是动效），仅去掉弹出动画。

## 6. 接入流程（平台 UX，Mine.tsx 新卡片「编码助手联动」）

三态卡片：

- **未检测到**：灰卡"未检测到 Claude Code" + 官方安装指引链接。检测逻辑：`~/.claude/` 目录存在 或 PATH 有 `claude`（where/which）；可选 `claude --version` 显示版本（3s 超时即放弃，不阻塞 UI）。
- **未接入**：「一键接入」按钮 → 确认弹层**透明化三件事**：
  1. 写入 `~/.codress/bin/claude-hook.*` 与 bridge 配置文件；
  2. 向 `~/.claude/settings.json` 的 hooks 合并 10 条（可展开预览确切 JSON）；
  3. 在本机 127.0.0.1 起一个只收状态的监听。
  并强调：全程本机通信，不上传任何代码/对话内容。
- **已接入**：绿点"已接入 · 最近事件 12:34" + 「断开联动」+ 来源开关。

**联通确认的仪式感**：我们无法替用户触发 hook，所以文案引导"随便在一个项目里跟 Claude 说句话"——bridge 收到该来源首个事件时 UI 点亮"已联通"，桌宠同步 waving 打个招呼。这一下就是"接入成功"的确认。

**生效时机提示（必须写进接入完成文案）**：Claude Code 在会话启动时快照 hooks 配置——接入后**新开的会话立即生效，已开着的会话需要重启**（或在 `/hooks` 菜单确认加载）。不写这句，用户会在旧会话里说话、宠物没反应，误判"接入失败"。

**写 settings.json 的铁律**（`ClaudeHookInstaller` 实现约束）：

1. 读取失败 / JSON 非法 → 中止并给手动指引，**绝不覆盖**；
2. 写前备份 `settings.json.codress-bak-<ts>`（保留最近 3 份）；
3. 深合并：只 append 我方条目，用户已有 hooks 原样保留；幂等（重复接入先清我方旧条目再写）；
4. 原子写：tmp + rename；
5. 我方条目唯一识别标记：command 路径含 `.codress/bin/claude-hook`——卸载、去重、升级全靠它过滤，不依赖数组顺序。

## 7. mac / Windows 双平台适配

| 事项 | macOS | Windows |
|---|---|---|
| settings 路径 | `~/.claude/settings.json` | `%USERPROFILE%\.claude\settings.json`（代码里统一 `os.homedir()`） |
| hook 脚本 | `claude-hook.sh`（chmod 755） | `claude-hook.cmd`（若 §2 实测为 POSIX shell 则改装 .sh） |
| curl | 系统内置 | Win10 1803+ 内置 `System32\curl.exe`；安装时探测，缺失则提示（极罕见） |
| 防火墙 | bind 127.0.0.1 不弹窗 | 同左；**严禁 bind 0.0.0.0** |
| 脚本编码 | LF | `.cmd` 用 CRLF；避免 BOM 问题重演（参考打包 ps1 需 BOM 的前车之鉴，.cmd 恰恰不能带 BOM） |
| 应用卸载残留 | pkg 无卸载钩子 → 帮助文档兜底 | NSIS `customUnInstall` 尽力清 hooks |
| 脚本自愈 | 两平台一致：找不到 `bridge.port` → 立即 exit 0，零噪音 | 同左 |

## 8. 卸载（断开 Claude Code 链接）

入口：接入卡「断开联动」/ 宠物右键菜单。`ClaudeHookInstaller.uninstall()` 步骤：

1. `settings.json`：备份 → 删除所有 command 含 `.codress/bin/claude-hook` 的 hook 条目 → 清理因此变空的 matcher 组 / 事件数组 → 原子写回；
2. 删除 `~/.codress/bin/claude-hook.*`（`bridge.port/token` 若无其他来源在用则一并删）；
3. 聚合器注销该来源，桌宠回默认轮播，UI 回"未接入"。

边界情形：

- settings.json 被用户手改过：只按标记过滤，其余内容一个字节不动；
- 解析失败：中止，弹窗展示需手动删除的确切 JSON 片段；
- **Codress 先被卸载、hooks 残留**：脚本自愈设计保证只要脚本文件还在就零报错；脚本也被删的极端情况，Claude Code 会提示 hook 命令失败——应用卸载器（NSIS 钩子）尽力自动清 + 帮助文档给 3 行手动清理法；
- 可选支持兜底：`codress-desktop --unlink-claude` 命令行入口。

## 9. 安全与隐私

- hook JSON 可能携带 `tool_input`/对话片段（代码、密钥）→ bridge 收到后**只提取** `{event, session 短哈希, tool_name, is_error, cwd→项目名}`，原文即刻丢弃；不落盘、不打日志、不上报内容（仅按现有埋点口径记"接入/卸载"动作计数）。
- 仅监听 127.0.0.1；校验自定义头 `X-Codress-Token`（浏览器跨域发不出自定义头，天然阻断恶意网页对 localhost 的探测）；token 每次接入重新生成。
- 单向只读：桥不向 Claude Code 回写任何决策，hook 恒 exit 0，永不 block/deny 工具调用。

## 10. 里程碑

- **M1 状态桥打通**（hooks 先手写自测）：bridge + aggregator 骨架 + PetManager IPC + pet.html 外部状态驱动；覆盖 `UserPromptSubmit / PostToolUse / Stop` → running / celebrate / idle。
- **M2 完整状态**：waiting / failed / greet + TTL / 防抖 / 多会话聚合 + 名牌与气泡交互。
- **M3 接入产品化**：`ClaudeHookInstaller`（安装/卸载/幂等/备份）+ Mine.tsx 卡片 + mac/Windows 实测矩阵（含 §2 shell 验证）。
- **M4 生态扩展**：来源抽象接第二家（Codex CLI 的 notify 机制 / WorkBuddy）；持续关注官方 `/buddy` 是否回归——若回归且开放自定义形象，按 `pet-installer.ts` 模式做安装适配器。

## 11. 开放问题

1. Windows hook 宿主 shell 实测结果（决定 .cmd 还是 .sh/.ps1）；
2. 当前版本 hooks 是否支持异步/后台执行（若支持可进一步消除 timeout 顾虑）——实现时以所装版本文档为准；
3. 企业 managed-settings 只读场景：写入失败的降级提示文案；
4. 宠物"下桌"期间事件是否累计统计/成就（产品层决策，本方案不涉及）。

## 附录 A：`/buddy` 考古记录（v2.1.89 逆向，2026-07-26）

从 npm 归档的 v2.1.89 主包（旧发行方式，cli.js 全量在包内）提取的实现事实：

- **形态**：纯 TUI 文字/表情小生物，住在 CLI 界面 footer 里，不是桌面窗口，没有任何图片/图集资产。
- **孵化**：`/buddy` 触发一次 LLM 调用（querySource `buddy_companion`，temperature 1）生成"灵魂"JSON——名字、物种（species）、性格（personality ≤200 字）、稀有度（rarity），自带抽卡感；界面文案 "hatching a coding buddy… it'll watch you work and occasionally have opinions"。
- **互动**：工作时偶尔发表意见（服务端接口 `/api/organizations/<org>/claude_code/buddy_react` 按 {name, personality, species, rarity} 生成 reaction 文本）；在 prompt 里提它的名字会得到它的看法（"say its name to get its take"）；`/buddy pet` 撸它（顺带取消静音）、`/buddy off` 关闭；状态存全局配置（`companion` / `companionMuted` 字段）；官方强调 "your buddy won't count toward your usage"。
- **门控**：命令 `isHidden` 由特性开关控制，外加一条 15 秒的 "/buddy" teaser 通知——典型的限时活动做法，与"4 月 1 日上线、随后移除"的时间线吻合。
- **对本方案的意义**：buddy **没有任何自定义形象入口**（species 只是文案概念，不是美术资产），且已下线——佐证 §0 结论：往 Claude Code 里装皮肤此路不通，hooks 状态联动是唯一正道。

产品启发（M4 之后可选的糖，非本方案范围）：

1. **孵化仪式感**：codress 宠物首次上桌可生成"性格卡"（名字 + 一句性格描述），提升拥有感；
2. **偶尔有意见**：气泡低频随机吐槽（按状态从预置文案池抽取，无需 LLM），频率必须极克制；
3. **撸宠交互**：buddy 有 `/buddy pet`，codress 双击已被"打开主窗"占用，可在右键菜单加「摸摸头」触发 waving/jumping。
