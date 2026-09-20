---
name: case-repair
description: Edit an existing mystery case or repair blocked evidence paths while retaining stable IDs, revisions, and independent verification.
---

# 编辑与修复

先 read_case 与 validate_case，定位具体失败字段和依赖链。保留现有 ID，优先改最少字段。

修复任务必须保留 truth 完全不变，不得降低结案要求。若证据被锁在需其自身才能进入的场景，应把物证放到逻辑合理且可进入的场景，或更正误写的前置条件；不是删除证据。修复后读 case-audit 并重新验证。

普通编辑按用户要求修改，保持时间线、人物回答和物证描述一致。propose_case 提交完整案件；返回 diff 和 affectedScenes 用来说明哪些镜头会过期。只改对白通常不需要重做空场景镜头，改人物外观或场景提示才需更新相应视觉素材。

遇到并发版本变更不得覆盖最新内容；让系统返回冲突，用户可重新执行。保存的是新的修订，旧版随时能恢复。
