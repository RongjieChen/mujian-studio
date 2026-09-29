# 对抗性测试与证据范围

测试命令：`npm run check`。包含 35 个自动测试，使用真实规则、存储、HTTP 应用和 Pi SDK；其中模型响应及 GPU 控制接口按测试场景模拟。不能将 35 个测试写成 35 次真实模型创作成功。

实机样本目录：`evidence/release-2026-09-27`。环境和测量结果见 [工作负载实测](RELEASE-AUDIT.md)。

## 自动对抗测试覆盖

| 攻击或失败 | 独立于模型的验收 | 实现证据 |
|---|---|---|
| 猜测未开放场景、未取得证据的 ID | 玩家状态不能越过获取条件 | `tests/game.test.ts` |
| 人物提前交出证词、替代话题绕过出示条件 | 检查器拒绝条件不匹配，播放器执行相同条件 | `tests/game.test.ts` |
| 指对嫌疑人但缺少关键证据 | 64 种证据子集按真实结案条件检查 | `tests/game.test.ts` |
| 单证据自依赖、两证据循环、悬空引用 | 报告不可达与引用问题，重放路径不能伪造通过 | `tests/game.test.ts` |
| 模型不验证就提交，或验证后又修改 | Pi 提交工具拒绝过期或缺失的案件哈希 | `tests/agent-boundaries.test.ts` |
| 以删除证据、改凶手、改证词消除错误 | 修复允许范围之外的改动被拒绝 | `tests/adversarial.test.ts`、`tests/agent-boundaries.test.ts` |
| 叙事初审试图写案件或引用不存在的原文 | 不提供写工具；逐字检查来源路径与引文 | 同上 |
| 新建短篇增加第四个人物 | 草稿工具拒绝，要求符合 3 人物、3 场景、6 证据 | `tests/agent-boundaries.test.ts` |
| 局部改开场顺带改其他内容 | `patch_story` 只更新一个顶层字段，并使旧验证失效 | `tests/agent-boundaries.test.ts` |
| PNG 魔数后附垃圾数据 | sharp 完整解码失败，不保存素材 | `tests/adversarial.test.ts`、`tests/http-boundaries.test.ts` |
| 外站 Origin、伪 Host、坏 JSON、超大请求 | HTTP 拒绝；有效图片仍可上传和导出 | `tests/http-boundaries.test.ts` |
| 用过期版本恢复覆盖新修改 | 返回冲突，已保存的新版本不丢失 | `tests/http-boundaries.test.ts`、`tests/persistence.test.ts` |
| 用户文本含脚本结束标记，或实体 ID 为 constructor | 导出转义、无原型字典，不发生脚本/原型冲突 | `tests/persistence.test.ts` |
| 用旧报告导出已损坏案件 | 导出重新检查实际案件数据 | `tests/persistence.test.ts` |
| 新图片替换首帧、人物视觉描述变化 | 相关视频/图片过期；替换过的旧文件缺失不阻止当前素材导出 | `tests/game.test.ts`、`tests/persistence.test.ts` |
| 排队取消、执行取消、提交完成时才取消 | 状态分别反映取消或已持久化成功 | `tests/jobs.test.ts` |
| 上次未完成作业留在磁盘 | 启动恢复函数标记中断；完成作业不改写 | `tests/jobs.test.ts` |
| 媒体失败、休眠已经生效但响应被取消 | 独立恢复信号卸载媒体并唤醒语言服务 | `tests/gpu-memory.test.ts` |

创作模式的 `patch_truth` 可以局部调整真相字段，修改后旧验证失效；规则修复模式不暴露该工具。自动测试验证工具隔离与重新验证要求，不能把该模拟测试写成真实模型调用。

格式错误测试验证：缺失场景提示、时间线字段类型错误时，由真实 Zod 校验拒绝并记录具体路径，纠正后仍须实际验证才能提交。

“恢复函数测试”不等于对生产 Spark 强制断电；模拟 GPU 故障不等于生产模型经历了所有取消时序；HTTP 边界测试不等于公网安全审计。

## 实机复核办法

真实案件及媒体运行日志分别保存 `*-job.json`、`*-project.json`，包含作业 ID、输入、状态、工具事件和时刻。失败样例保留，作者反馈后的修订不算首次生成成功。

`npx tsx scripts/verify-release.ts evidence/release-2026-09-27` 对已保存的案例再次核对修复允许范围、引用原文、案件哈希、开场单字段差异，并通过实际玩家规则重放。追加 `--complete` 将同时检查最终新建/局部编辑/伪指令修复、正式 MP4 参数和带素材离线成品，结果见 complete-verification.json。该脚本独立于生成模型，但复用项目规则实现，不应称为另一套独立算法的正确性证明。

`scripts/verify-live-agents.py` 调用真实已配置模型，测试新题生成、开场单字段编辑及场景内伪指令下的规则修复。它创建隔离项目并保存作业句柄；观察超时后继续轮询原任务，不因为超时重复提交。不要在同一输出目录同时运行两个副本。

`scripts/verify-browser.cjs` 使用 Playwright 和已安装 Chrome，验证未保存草稿的导航保护、JSON 编辑切换、保存及恢复版本，以及导出文件在浏览器离线环境中的完整调查与结案。对带素材项目还读取视频的真实尺寸、时长与加载状态，记录外部 HTTP 请求和页面错误。

```bash
# Playwright 需要可用的 Node 包与本机 Chrome；不是 npm run check 的依赖。
APP_URL=http://127.0.0.1:4317 node scripts/verify-browser.cjs
# 可设置 PLAYWRIGHT_MODULE 指向已有 Playwright 模块路径。
# 指定已有带视频项目时，仅验证它的导出与离线播放器：
APP_URL=http://127.0.0.1:4317 PROJECT_ID=实际项目ID node scripts/verify-browser.cjs
```

以上工具会保存文件和测试项目，应对隔离工作空间或明确用于验收的项目运行。

## 样本观察与限制

- 正常案件的叙事初审包含弱疑点或误报；可靠录像与既定时间线冲突的样本能取得有效原文引文。样本量不支持准确率估计。
- 旧书店案例同题三次调试，前两次未产生有效交付；第三次结构规则通过，原稿仍存在换卡方向矛盾、证据剧透和指纹依据缺失。见 `strict-generation-*` 和 `raw-generation-author-review.md`。
- 渡轮示范作品经过作者反馈与终审，原始生成、修订和定稿分别保存。不能将该成品算作一次自动生成的结果。
- 引文逐字匹配只证明引用存在，不证明解释正确。结构可通关不证明唯一解、推理公平或文学质量。
- 场景图与视频没有准确呈现信箱、蜡封等提示细节。游戏证据以可编辑文字和固定规则为准。
- 测试不覆盖真人创作效率、大规模未见题集、Skills 消融、长期压力、跨镜头角色一致性或 StepFun 真实调用。

## 测量约定

模型测量记录硬件、模型标识与来源、软件版本、任务 ID、输入、结果及人工介入。排队、加载、生成、恢复和缓存分别计时。PyTorch peakAllocated 只代表进程记录范围；离散系统采样不能捕捉每个瞬时峰值。

同一案件的多次调试不是独立保留样本，使用过的提示调试样本不能用来估计未见任务上的成功率。
