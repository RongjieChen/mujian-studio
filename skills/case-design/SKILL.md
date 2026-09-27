---
name: case-design
description: Design a complete, editable short mystery game from a story brief. Use for new case creation, not ordinary chat or media rendering.
---

# 案件设计

先 read_case_schema 读取真实契约。按顺序确定真相、作案时间线、三个成年嫌疑人的动机与在场说法，再倒推证据。不要先写漫长小说再试图接上规则。

- 新建短篇固定为 3 个场景、3 名人物、6 条证据；这是工具验收条件，不能额外加入可交互人物。背景人物可以仅在文字中出现。至少一条结案必需证据必须通过携带现场物证盘问人物才能得到。带条件的现场笔记不等于人物证词。
- 第一稿优先采用简单、可检查的布局：三个场景的 requires 全部为 []；五条现场物证分布到场景，requires 全部为 []；第六条为证词，sceneId 为 null，requires 为两条已有物证的 ID。某位在场人物的一个话题用相同两条物证作为 requires，并在 reveals 中给出证词 ID。truth.requiredEvidenceIds 必须包含这条证词及支持真相的物证。不要把现场证据锁在“先拿到该场景内证据才能进入”的场景里。作者明确要求更复杂布局时再设计额外门槛。
- 现场物证有 sceneId；问话证词 sceneId 必须为 null，只由 topics.reveals 获取。
- 所有人物必须放进场景 characterIds。场景至少一个无前置证据。
- 两种结局 kind 分别是 solved、wrong。真相指定嫌疑人以及至少两条必要证据。
- 正向依赖：requires 全部是证据 ID。不得依赖“已经结案”或自己的产物。问话 requires 包含它揭示的证词自身 requires。
- 关键日期与物证文字在 description 准确表达；视频只是氛围与表演，不能承载唯一证据。
- 说谎可作为剧情，但固定真相、人物知识、各阶段回答应能解释，不让开场问话直接剧透。
- 镜头优先空场景或单人轻微动作；固定服装和布景，禁止写“完美一致”一类不可验证保证。

propose_case 提交完整结构，参数为 {case:完整对象,note:修改说明}，不能省略 case 或 note。如果工具因数量拒绝且还没有接受草稿，需要重新 propose_case；有工作草稿后，使用 patch_case 修改具体实体，使用 patch_truth 修改创作中的结案证据字段，不要用不改变内容的调用测试工具。返回的 validEvidenceIds 是所有 requires 的合法取值；场景名和场景 ID 不能放入 requires。读取 case-audit 并实际 validate_case 后，才能 commit_case。
