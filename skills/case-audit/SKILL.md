---
name: case-audit
description: Check mystery evidence dependencies, valid references and a replayable winning path before committing or exporting a case.
---

# 案件验收

运行 validate_case。工具输出是确定性检查，模型自己的判断不能替代它。

检查器覆盖标识与引用、开场入口、人物位置、证词来源、前置条件、所有证据与场景可达、正确结案路径。DSL 只有正向证据条件与增加库存的动作，可用最小不动点求解；不支持任意脚本或互斥状态。返回的 winningPath 可在独立播放器状态机里重放。

error 未清零不得 commit_case。warning 应在摘要中解释。通过结构检查不等于人物动机自然、推理公平或故事好玩；摘要应保留需作者审阅的叙事问题。

不得通过删除结案要求、篡改报告、添加“通过”字符串或改验收器逃过检查。不要把已有素材当作现场新生成。
