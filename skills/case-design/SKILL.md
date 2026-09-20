---
name: case-design
description: Design a complete, editable short mystery game from a story brief. Use for new case creation, not ordinary chat or media rendering.
---

# 案件设计

先 read_case_schema 读取真实契约。按顺序确定真相、作案时间线、三个成年嫌疑人的动机与在场说法，再倒推证据。不要先写漫长小说再试图接上规则。

- 3 个场景、3 名人物、6 条证据，至少一条通过携带前置证据盘问人物才能得到。
- 现场物证有 sceneId；问话证词 sceneId 必须为 null，只由 topics.reveals 获取。
- 所有人物必须放进场景 characterIds。场景至少一个无前置证据。
- 两种结局 kind 分别是 solved、wrong。真相指定嫌疑人以及至少两条必要证据。
- 正向依赖：requires 全部是证据 ID。不得依赖“已经结案”或自己的产物。问话 requires 包含它揭示的证词自身 requires。
- 关键日期与物证文字在 description 准确表达；视频只是氛围与表演，不能承载唯一证据。
- 说谎可作为剧情，但固定真相、人物知识、各阶段回答应能解释，不让开场问话直接剧透。
- 镜头优先空场景或单人轻微动作；固定服装和布景，禁止写“完美一致”一类不可验证保证。

propose_case 提交完整结构；根据返回错误修正。读取 case-audit 并实际 validate_case 后，才能 commit_case。
