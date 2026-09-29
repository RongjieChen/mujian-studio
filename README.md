# 幕间 · 推理影游创作工坊

把一个悬疑故事，做成可以搜证、盘问和结案的互动作品。Pi 执行专业创作 Skills，固定规则引擎检查证据链，DGX Spark 提供本地语言模型推理与素材生成。创作阶段生成镜头，游玩阶段读取素材，导出的 HTML 可以独立运行。

![末班渡轮的蓝色信封](evidence/release-2026-09-27/fresh-start.png)

[演示视频与离线试玩](https://github.com/RongjieChen/mujian-studio/releases/tag/hackathon-2026-09-29) · [产品与技术设计](docs/PROJECT.md) · [部署说明](docs/DEPLOYMENT.md) · [测试方法](docs/TESTING.md) · [实测数据](docs/RELEASE-AUDIT.md)

## 主要功能

- **案件创作**：从故事要求编排场景、人物、物证、证词与不同结局。
- **可编辑剧本**：修改对白、真相和调查条件，保存修订、恢复旧版，并检查并发修改冲突。
- **证据链检查**：识别缺失引用、循环依赖和不可达证据，按播放器规则重放结案路径。
- **受限修复**：Agent 只调整依赖关系，保护人物、对白、证据文字、真相和结案要求。
- **叙事初审**：引用原文检查时间线和事实疑点，由作者核对模型判断。
- **本地素材**：用 SDXL 生成场景图片，用 Wan 2.2 TI2V 5B 制作参考图短镜头。
- **独立分享**：导出内嵌素材与播放器的 HTML，也可导出案件 JSON 继续编辑。

## 快速启动

需要 Node.js ≥ 22.19，推荐 Node 22 LTS。

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

打开 `http://127.0.0.1:4317`。没有模型服务时，可以使用手写示例、编辑案件、检查规则、试玩及导出。AI 创作与媒体生成需要配置相应模型服务。

本地语言模型使用 OpenAI 兼容端点，在 `.env` 配置 `LLM_BASE_URL`、`LLM_MODEL`。可选 StepFun 接口通过 `LLM_PROVIDER=stepfun` 与 `STEPFUN_API_KEY` 配置；密钥只在服务端读取。模型权重与凭证不随仓库分发。

## 使用流程

1. 新建作品，输入故事背景和创作要求。Pi 读取技能与数据契约，调用草稿、检查和保存工具。
2. 在「剧本与证据」中编辑场景、人物、对白、物证与真相。每次保存创建修订。
3. 在「场景与分镜」中生成图片或短视频，也可导入 PNG/JPEG。视频可使用当前场景图作为首帧。
4. 在「检查与修复」中查看证据可达性和结案路径，修复依赖错误。
5. 运行只读叙事初审，核对原文引用及疑点。修改案件后，旧初审会提示过期。
6. 试玩搜证、出示物证、盘问和指认，再导出作品。

新建短篇采用三个场景、三个成年人物、六条证据与两种结局。导入和手动编辑支持数据契约范围内的其他规模。规则错误会阻止 HTML 导出；单个素材超过 80 MB 时也会阻止单文件导出。

## 技术架构

```text
浏览器工作台 ── Node / Express ── 项目修订、作业、素材缓存
                     │
                     ├─ Pi SDK
                     │    ├─ 专业 Skills
                     │    ├─ read / propose / validate / commit 受限工具
                     │    └─ 本地 vLLM / llama.cpp 或可选 StepFun
                     │
                     ├─ 固定案件检查器 → 玩家动作重放
                     │
                     └─ 单 GPU 作业队列 → Python 媒体服务
                                          ├─ SDXL 场景图片
                                          └─ Wan 2.2 TI2V 5B 视频
```

Pi 不具备任意 shell 或文件写工具。检查器由固定代码执行，检查结果绑定当前案件哈希；草稿改变后必须重新验证。任务失败保留已有作品，服务重启后未完成作业标记为中断，支持重试。

调查条件采用「已取得全部指定证据」，玩家动作只增加证据。检查器计算可达信息集合，再使用播放器相同的动作规则重放结案路径。该检查覆盖结构可达性；自然语言合理性、线索公平和故事趣味性由作者审阅。

素材缓存包含提示、视觉风格、人物设定、种子与首帧内容。视觉设定改变时提示相关素材过期，新图像使依赖旧首帧的视频过期。单台 DGX Spark 通过语言模型休眠、媒体模型卸载与顺序队列协调统一内存。

## 模型与使用范围

语言服务支持本地 vLLM / llama.cpp；媒体服务使用 PyTorch、Diffusers、SDXL 和 Wan 2.2。Spark 环境为 Linux ARM64、GB10、CUDA 13.0，安装参数见 [部署说明](docs/DEPLOYMENT.md)。

图片为 1024×576；视频草稿配置为 768×448、49 帧、24 FPS，正式配置为 1280×704、121 帧、24 FPS。生成结果用于场景氛围，关键文字与线索由游戏数据和规则表达。镜头预先生成，播放不调用实时视频模型。

本版本不提供配音、自由对话或长片生成；跨镜头人物一致性没有质量保证。StepFun 为可选接入路径，未包含其真实调用测试。模型配置、样本耗时、失败案例和测量限制见 [实测数据](docs/RELEASE-AUDIT.md)。

## 测试

```bash
npm run check
```

测试覆盖玩家路径重放、证据死锁、修复越界、原文引用验证、图片校验、并发保存、取消恢复和 HTML 注入转义。模型响应与 GPU 控制故障在自动测试中模拟；真实模型样本另存于 [evidence](evidence/README.md)。详细方法见 [测试说明](docs/TESTING.md)。

## Skills 与目录

- [case-design](skills/case-design/SKILL.md)：从真相设计线索与人物阶段。
- [case-audit](skills/case-audit/SKILL.md)：读取规则检查结果及其适用范围。
- [case-consistency](skills/case-consistency/SKILL.md)：只读叙事初审与原文引用。
- [case-repair](skills/case-repair/SKILL.md)：保护故事内容，修复依赖关系。
- [shot-direction](skills/shot-direction/SKILL.md)：镜头约束、输入指纹与素材重做。

`src/core`：数据契约、规则与检查器；`src/server`：Pi、作业与导出；`src/web`：工作台与播放器；`scripts/media_worker.py`：本地 GPU 服务。

## 许可证

应用代码采用 [MIT](LICENSE)。Pi、React、llama.cpp 等依赖遵守各自许可证；模型权重、服务与第三方素材适用各自的许可和使用条款。
