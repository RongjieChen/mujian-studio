# 幕间交付验收

目标：完成幕间、执行对抗性测试、准备参赛文档与录屏脚本。其他选题不在本次交付范围。

**工程、实机媒体、最终离线作品与测试证据已完成。** 提交包提供源码、成品 HTML、案件及素材备份、参赛说明、开发文章与录屏脚本。仓库公开、录制并上传 B 站、文章发布、团队资料和表单提交由所有者完成；没有代为发布。

| 要求 | 权威证据 | 结果与证明范围 |
|---|---|---|
| 前后端与独立播放器 | `local-check.txt`、`spark-check.txt`、`clean-install.txt` | 本机和 Spark 35 项测试与构建通过；隔离 npm ci 通过，不能外推为干净 Spark 全模型安装 |
| Pi 与专业 Skills | 新建、编辑、修复的 `*-job.json` | 真实模型读取 Skills、调用受限工具并保存作品，不只是生成计划 |
| 新案件生成 | `strict-generation-job/project.json`、两个 attempt 日志 | 同题第三次调试满足 3/3/6、条件证词与 12 步结案；前两次失败保留。原稿仍有叙事问题，见人工抽查 |
| 局部编辑与版本 | `patch-opening-job/project.json`、`ui-browser.json` | 真实 patch_story 仅改开场；浏览器保存与旧版恢复通过 |
| 修复与素材伪指令 | `hostile-repair-*.json`、`agent-checks.json` | 真实模型修复循环依赖，所有受保护故事字段保持相同；这是单例测试，不是通用抗注入保证 |
| 叙事初审 | `review-v2-normal-project.json`、`review-v2-conflict-project.json` | 可靠录像冲突取得有效逐字引文；正常案例有弱疑点/误报，不能作为正确性证明 |
| 图片与缓存 | `fresh-image-job.json`、`image-cache-job.json`、另外两场景的 image-job | 三场景图齐备；相同输入命中缓存。画面细节不完全符合提示 |
| 两档视频 | `fresh-video-draft-job.json`、`fresh-video-final-job.json`、实际 MP4 与 ffprobe | 草稿 768×448 / 49 帧；正式 1280×704 / 121 帧 / 24 FPS / 5.04 秒成功，正式应用作业约 28 分 20 秒 |
| GPU 资源切换 | 作业 memory 事件、`memory-samples.jsonl` | 媒体前休眠语言模型、媒体后卸载并唤醒成功；内存统计注明测量窗口 |
| 完整示范作品 | `final-ready-project.json`、`author-final-edit.json` | 《末班渡轮的蓝色信封》第 4 版，3 人物/3 场景/6 证据；AI 初稿、反馈修订和人工终审均留痕 |
| 带正式视频的离线作品 | `fresh-browser.json`、`fresh-offline-player.html` | Chrome file://、离线、15 步结案；正式视频 1280×704 成功加载，0 外部 HTTP 请求、0 页面错误 |
| 证据总复核 | `complete-verification.json` | `verify-release.ts --complete` 对保护字段、引用、数量、真实玩家重放、媒体文件与浏览器记录的全部断言通过 |
| 源码部署一致性 | `source-sync.json` | 47 份代码/测试/配置/Skill 文件 SHA256 与 Spark 部署一致；不是所有模型环境完全相同的证明 |
| 提交和拍摄材料 | SUBMISSION、DEPLOYMENT、ARTICLE、VIDEO-SCRIPT、DELIVERY | 500 字以上说明、实际技术栈、开发文章草稿、4 分 30 秒逐镜脚本和上传顺序已备 |

证据根目录：`evidence/release-2026-09-27`，跨 UTC 9 月 27 日与北京时间 9 月 28 日。模拟测试、历史实测、本轮实测和作者终审分别标注。最终原稿生成不是无人工审稿的发布承诺。

本轮本地权重使用机器已有目录标称 Qwen3.8-27B-NVFP4，配置架构为 Qwen3_5ForConditionalGeneration，来源没有独立核实。没有 StepFun 本轮真实调用证据，不把配置入口写成已使用；平台适配评分可能受影响。

提交要求依据用户提供的规则图：开源项目、500 字以上说明、本地部署与技术栈、Skills Markdown、B 站演示、团队合影和开发征文。此验收不替代组委会最新截止时间通知。
