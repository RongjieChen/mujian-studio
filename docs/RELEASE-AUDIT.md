# DGX Spark 工作负载实测

本页记录环境、样本输入与测量结果。语言模型生成、模拟响应自动测试和人工修订分别统计；同题调试样本不能用于估计总体成功率。

## 环境

- 硬件：单台 NVIDIA DGX Spark / GB10，Linux ARM64，CUDA 13.0。
- 语言服务：vLLM，32K 上下文，低并发，FP8 KV、MTP 与 sleep mode。
- 文本权重：机器既有目录标称 Qwen3.8-27B-NVFP4，实际配置架构为 Qwen3_5ForConditionalGeneration；来源未独立核实，现有预量化权重并非本项目自行量化。
- 媒体：SDXL 与 Wan 2.2 TI2V 5B，PyTorch / Diffusers。完整软件版本见 [环境记录](../evidence/release-2026-09-27/environment.json)。
- 运行记录：2026-09-27/28；日期用于区分机器、模型与配置对应的测量批次。

## 媒体工作负载

| 输出 | 参数 | 应用作业耗时 | 媒体 worker / 其中加载 |
|---|---|---:|---:|
| 场景图 | 1024×576，20 步，seed 927 | 71.926 秒 | 53.262 / 47.698 秒 |
| 草稿视频 | 768×448，49 帧，24 FPS，20 步 | 338.212 秒 | 289.600 / 116.520 秒 |
| 正式视频 | 1280×704，121 帧，24 FPS，50 步 | 1699.939 秒 | 1693.021 / 100.685 秒 |

应用耗时从 startedAt 到 finishedAt，包含切换、加载和恢复，不含排队。worker 使用另一段测量窗口，两个数值不能相加。视频分别约 2.04 秒、5.04 秒，均无音轨，属于创作阶段预生成的素材。

原始作业和文件：[图片任务](../evidence/release-2026-09-27/fresh-image-job.json)、[草稿视频任务](../evidence/release-2026-09-27/fresh-video-draft-job.json)、[正式视频任务](../evidence/release-2026-09-27/fresh-video-final-job.json)、[文件参数](../evidence/release-2026-09-27/formal-file-probe.json)。

PyTorch peakAllocated 在模型加载后重置计数，草稿约 30.038 GiB，正式约 42.902 GiB。581 条离散内存采样中，MemAvailable 最低约 21.324 GiB，swap 使用最高约 10.021 GiB。这些指标不代表整机瞬时峰值，swap 也包含已有系统状态。见 [原始采样](../evidence/release-2026-09-27/memory-samples.jsonl)。

画面能够表达船舱与港口氛围，但未准确复现信箱、蜡封等细节。视频基于场景图，因此不适合用来核验文字物证或物理场景。

## 案件和 Agent 样本

| 测试对象 | 结果与适用范围 | 数据 |
|---|---|---|
| 新题生成 | 同题第三次运行满足 3 人物、3 场景、6 证据和 12 步结案；前两次失败，第三次仍有叙事问题 | strict-generation-*、[作者抽查](../evidence/release-2026-09-27/raw-generation-author-review.md) |
| 局部编辑 | patch_story 只改变开场，修改后重新验证 | patch-opening-* |
| 受限修复 | 循环依赖可恢复，受保护故事字段保持相同；单例不构成通用抗注入保证 | hostile-repair-*、repair-diff.json |
| 叙事初审 | 对录像与时间线冲突给出有效原文引文；正常样本有弱疑点或误报 | review-v2-* |
| 离线游玩 | 《末班渡轮的蓝色信封》修订 4，浏览器离线完成 15 步结案，0 外部 HTTP 请求、0 页面错误 | final-ready-project.json、fresh-browser.json |

以上文件位于 [样本目录](../evidence/release-2026-09-27/)。示范作品经过 AI 初稿、反馈修订与作者终审，不能视为一次自动生成即可发布。模型初审只能辅助审阅，原文引用存在不等于解释正确。

## 测试范围

35 项自动化测试覆盖应用规则、受限工具、存储、HTTP 边界、素材校验与故障恢复，模型响应和 GPU 控制故障采用模拟端点。测试方法见 [TESTING](TESTING.md)，样本复核结果见 [complete-verification.json](../evidence/release-2026-09-27/complete-verification.json)。

可达性检查不证明自然语言一致性、唯一解、推理公平或趣味性。数据不包含真人创作效率、长期稳定性、大规模未见题集、Skills 消融、跨镜头人物一致性、配音和 StepFun 真实调用结果。
