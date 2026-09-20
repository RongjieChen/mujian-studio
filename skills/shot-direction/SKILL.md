---
name: shot-direction
description: Plan bounded local still and video shots for an interactive mystery, retaining reference images, seeds, versions and generation receipts.
---

# 分镜制作

视频在创作阶段生成并缓存，玩家不等待推理。每个镜头固定场景、人物服装与动作，第一版优先空镜和单人轻微动作。已有图片可作为视频首帧参考；同一人物在多镜头中仍需人工比较身份、服装和关键道具。

由本地作业系统顺序调度 GPU。记录提示词哈希、模型、种子、参数、耗时与实际文件。只有输出存在且可解码才成功。缓存命中、上传素材和模型生成分别标记。失败保留旧素材；取消和重启不得显示成功。

关键物证文字、日期、玩法条件由结构化数据和 UI 呈现，不依赖生成画面的文字准确性。没有语音模型时不要承诺有配音或口型同步。Sol-H3 未实测前只作为可选研究路线。
