# DGX Spark 案件与媒体样本

测量日期为 2026-09-27/28。真实模型运行、模拟响应自动测试、浏览器验证和作者修订分别保存，不能合并计算成生成成功率。环境与结果汇总见 [工作负载实测](../../docs/RELEASE-AUDIT.md)。

## 单台 DGX Spark 媒体实测

| 项目 | 实际输出 | 应用作业耗时 | 媒体 worker 耗时 / 其中加载 |
|---|---|---:|---:|
| 新图片 | 1024×576，20 步，seed 927 | 71.926 秒 | 53.262 / 47.698 秒 |
| 草稿视频 | 768×448，49 帧，24 FPS，2.042 秒，20 步 | 338.212 秒 | 289.600 / 116.520 秒 |
| 正式视频 | 1280×704，121 帧，24 FPS，5.042 秒，50 步 | 1699.939 秒（约 28 分 20 秒） | 1693.021 / 100.685 秒 |

三次均是新推理输出，另有 `image-cache-job.json` 验证相同输入复用素材。应用耗时按 startedAt 到 finishedAt 计算，含模型切换、加载与恢复；不含先前排队。worker 耗时是另一段测量窗口，不应与应用耗时相加。媒体均无音轨。

`fresh-video-final-job.json` 保存正式作业成功状态和参数，`media/fresh-final.mp4` 为实际文件，`formal-file-probe.json` 是对文件执行 ffprobe 的结果；五个抽样帧见 `media/final-frames.png`。草稿和图片相应文件独立保存，不把放大后的草稿称为正式生成。

PyTorch 在模型加载后重置峰值计数，报告草稿约 30.038 GiB、正式约 42.902 GiB 的 peakAllocated；它不是进程全生命周期峰值或整机内存峰值。581 条离散采样中 MemAvailable 最低约 21.324 GiB，swap 使用最高约 10.021 GiB；swap 包含此前系统状态，不能全部归因于本次视频，也不能据此声称捕捉了瞬时峰值。原始采样见 `memory-samples.jsonl`。

抽样帧有稳定的船舱、港口与灯光氛围，但没有准确还原信箱、蜡封等提示细节。图片和视频用于氛围；线索以可编辑的游戏文字和规则为准。没有测试电影级连续镜头或世界模型。

## 模型与配置来源

环境见 `environment.json`。文本使用机器已有目录标称 Qwen3.8-27B-NVFP4 的预量化权重；实际 config 架构为 Qwen3_5ForConditionalGeneration，来源没有独立核实，服务别名不等于官方模型身份。没有从零训练或自行完成权重量化的证据。当前 vLLM 使用 32K 上下文、低并发、FP8 KV、MTP 与 sleep mode；不把配置开关等同于经过消融验证的性能提升。本组数据不含 StepFun 调用。

## 证据阅读顺序

1. `local-check.txt` / `spark-check.txt`：自动测试与构建。模型响应和 GPU 控制故障在自动测试中模拟。
2. `new-case-job.json` / `new-case-project.json`：首份陌生题原稿，包含额外人物及叙事问题，不能写成完全合格的首次生成。
3. `author-polish-before.json` 及作者修订记录：明确反馈后的修订，与首次生成分开。
4. `deadlock-*` / `repair-diff.json`：真实模型修复规则死锁，全故事保护字段比较。
5. `review-v2-*`：只读叙事初审引用，包含弱疑点；引用存在不等于解释正确。
6. `ui-browser.json`：Chrome 未保存编辑保护、保存/恢复和示例离线结案。
7. `raw-draft-browser/`：首版案件带草稿视频的离线结案，有 0 外部 HTTP 请求及 0 页面错误。
8. `final-ready-project.json`、`fresh-browser.json`、`complete-verification.json`：示范作品数据、离线玩家操作记录及断言结果。

实测样本少，调试中的重试不是独立未见样本。所有结论限于给定版本、机器与输入。

补充：strict-generation-attempt1/2 保留失败，第三轮规则通过但文学与证据问题见 raw-generation-author-review.md。patch-opening 真实局部编辑通过；hostile-repair 真实素材伪指令测试通过。应用自动测试包含 35 项，模型响应模拟与真实作业记录分别统计。
