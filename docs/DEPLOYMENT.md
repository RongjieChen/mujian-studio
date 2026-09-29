# 单台 DGX Spark 部署

以下路径均为独立项目目录示例，不会覆盖系统模型或修改现有业务服务。远程主机地址和凭证不写入仓库。

## vLLM 接入

测试环境使用机器既有目录标称 Qwen3.8-27B-NVFP4 的权重，服务别名 `qwen3.8-27b`，端口 8000。权重来源尚未独立核实，模型目录名不作为官方发布身份的证明。vLLM 与下方 llama.cpp 使用不同的休眠接口；预量化权重不由本项目提供。

工作台配置：

```dotenv
LLM_PROVIDER=local
LLM_BASE_URL=http://127.0.0.1:8000/v1
LLM_MODEL=qwen3.8-27b
LLM_API_KEY=填写你的服务密钥
LLM_CONTEXT=32768
LLM_MAX_TOKENS=12000
LLM_REASONING=false
LLM_THINKING_FORMAT=qwen-chat-template
GPU_EXCLUSIVE=true
GPU_BACKEND=vllm
LLM_ADMIN_URL=http://127.0.0.1:8000
LLM_WAIT_FOR_SLEEP=false
```

测试环境为 vLLM 0.29.0、PyTorch 2.13.0、Transformers 5.17.0（与媒体服务的 PyTorch 2.9.1 环境分开）。已验证的服务参数封装在 `scripts/start-vllm.sh`：设置 `VLLM_ENV`、`MODEL_DIR`、`VLLM_API_KEY` 后执行 `bash scripts/start-vllm.sh`。模型目录需包含匹配权重与 `chat_template.jinja`。脚本用于启动服务，CUDA/ARM64 推理依赖需要独立安装。

模型服务需要 `--enable-sleep-mode`、本地控制接口，以及与模型匹配的聊天模板、工具解析器和 CUDA 环境。实机保留既有 NVFP4、FP8 KV 与 MTP 配方，应用侧将服务上下文缩至 32768、max-num-seqs=2、max-num-batched-tokens=4096、gpu-memory-utilization=0.45。此配置是当前工作负载的运行参数，不是所有 Spark 的最佳配置。环境与测量数据见 [工作负载实测](RELEASE-AUDIT.md)。

启用 `VLLM_SERVER_DEV_MODE=1` 后的 `/sleep`、`/wake_up` 等控制路由不能假定受普通 API Key 保护，因此**必须将 vLLM 绑定到 127.0.0.1**。不要公开这个端口。工作台只允许 loopback 的管理地址。媒体任务前调用 `/sleep?level=1&mode=wait`，等待现有推理完成，不使用默认 abort 模式；媒体结束后卸载扩散模型，再恢复语言模型。请求取消时也使用独立恢复信号，避免留下无人恢复的休眠状态。

图像上传使用 sharp 完整解码，Spark 的 ARM64 依赖由 `npm ci` 按锁文件安装。视频服务还需要 `ffmpeg` 和 `ffprobe`。开发界面单独使用 Vite 端口时，在 `APP_ALLOWED_ORIGINS` 中明确填写该来源；默认不放开所有 localhost 端口。

## llama.cpp 接入

在 Spark 上构建已固定版本的 llama.cpp。测试使用版本：`b11062`，提交 `3cf03257f219afbe7334045ff7c6a06ac68c627d`。

```bash
git clone --depth 1 --branch b11062 https://github.com/ggml-org/llama.cpp.git
export PATH=/usr/local/cuda/bin:$PATH
cmake -S llama.cpp -B llama.cpp/build \
  -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=121a-real \
  -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF
cmake --build llama.cpp/build --target llama-server --config Release -j 12
```

该路径使用的案件模型是 `Qwen/Qwen3-Next-80B-A3B-Thinking`。原始权重来自机器已有目录，使用同一份 llama.cpp 转为 F16 GGUF，再量化为 Q4_K_M。原目录保持不变；生成的 GGUF 约 47,258.42 MiB，平均 4.87 BPW。自转换文件 SHA256：`1624acebd3e14f320d5e9c9dd8a2c78698ee5fa15e7e6f06e81077c6444a4c49`。

```bash
python llama.cpp/convert_hf_to_gguf.py /absolute/models/Qwen3-Next-80B-A3B-Thinking \
  --outtype f16 --outfile /absolute/models/qwen3next-f16.gguf
cmake --build llama.cpp/build --target llama-quantize -j 12
llama.cpp/build/bin/llama-quantize \
  /absolute/models/qwen3next-f16.gguf /absolute/models/qwen3next-Q4_K_M.gguf Q4_K_M 16
./llama.cpp/build/bin/llama-server \
  --model /absolute/models/qwen3next-Q4_K_M.gguf \
  --alias qwen3-next-80b-q4 --host 127.0.0.1 --port 8088 \
  --ctx-size 32768 --parallel 1 --n-gpu-layers 99 --jinja \
  --reasoning on --reasoning-format deepseek --reasoning-budget 2048 \
  --temp 0.6 --top-k 20 --top-p 0.95 --min-p 0 --sleep-idle-seconds 30
```

对应 `.env` 设置 `LLM_MODEL=qwen3-next-80b-q4`、`LLM_REASONING=true`。这是只支持 thinking 模式的模型，不能套用关闭 thinking 的部署示例。Pi 请求也携带 `thinking_budget_tokens=2048`；是否严格限制思考长度取决于当前 llama.cpp 模板与解析器，任务总时限另行约束。

## 内存调度

在同一台 Spark 使用较大语言模型与视频模型时，启用：

```dotenv
GPU_EXCLUSIVE=true
LLM_WAIT_FOR_SLEEP=true
LLAMA_ADMIN_URL=http://127.0.0.1:8088
```

开始本地 Agent 作业前，工作台调用素材服务 `/unload` 释放驻留的扩散模型与 CUDA 缓存。开始视频作业前，工作台查询 llama.cpp `/props`，确认 `is_sleeping=true` 再提交；必须同时配置上面的 `--sleep-idle-seconds 30`。图片与视频、Agent 任务共用一个队列。该策略交换了模型驻留速度与可用内存，冷加载耗时不能从端到端成绩里删除。

健康检查不会把缓存结果冒充新生成。若未配置兼容的 llama.cpp，不启用此保护选项；较小模型可采用常驻方式。不要同时运行多个使用同一数据目录的工作台进程。

## 本地图片与视频

使用独立 Python 3.12 环境。CUDA 版 PyTorch 必须支持 ARM64 和 SM121；CPU 版能导入并不代表已启用 GPU。

```bash
python3 -m venv .venv-media
.venv-media/bin/pip install torch==2.9.1 torchvision==0.24.1 \
  --index-url https://download.pytorch.org/whl/cu130
.venv-media/bin/pip install -r scripts/media-requirements.txt
.venv-media/bin/python -c 'import torch; print(torch.__version__,torch.version.cuda,torch.cuda.is_available())'
```

模型：`stabilityai/stable-diffusion-xl-base-1.0` 的 fp16 Diffusers 目录；`Wan-AI/Wan2.2-TI2V-5B-Diffusers`。可以提前下载并通过环境变量指向本地路径。模型许可、网络下载与运行配置独立于应用代码。

```bash
export SDXL_MODEL=/absolute/models/sdxl-base
export WAN_MODEL=/absolute/models/Wan2.2-TI2V-5B-Diffusers
export MEDIA_DATA_DIR=/absolute/mujian-data/media-worker
.venv-media/bin/uvicorn scripts.media_worker:app --host 127.0.0.1 --port 4318
```

Diffusers 0.35.2 的 Wan 2.2 VAE 分块模式存在 patchify 不匹配，会触发 12/3 通道错误；本配置关闭 VAE tiling，使用普通路径。媒体依赖锁定 ftfy 6.3.1。升级依赖或启用 tiling 后需要验证模型兼容性。

`GET /health` 返回 GPU、当前加载的任务类型与 busy。`POST /jobs` 创建异步作业，`GET /jobs/:id` 读取进度与产物，`POST /jobs/:id/cancel` 在采样步边界取消。模型加载本身不保证可立即取消。图片与视频模型在切换时释放旧模型，应用层一次只调度一个重任务。

## 工作台

Spark 自带 Node 18 不能运行本版本 Pi，需要独立安装 Node ≥22.19。在安装目录设置 PATH，避免替换系统 Node。

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

## 远程访问

所有服务保持 loopback。用用户自己的 SSH 配置：

```bash
ssh -N -L 5317:127.0.0.1:4317 your-spark-alias
```

本机访问 `http://127.0.0.1:5317`。如果仅在 Spark 运行模型，本机运行工作台，则转发 8088 与 4318，并配置本机 `.env`。这两种部署模式的性能记录必须注明服务所在主机。

## 数据与恢复

`data/projects` 保存完整修订，`data/jobs` 保存任务记录，`data/media` 保存已交付素材。工作台写入采用临时文件与原子重命名；当前是单 Node 进程设计，不可直接启动多个写入相同数据目录的实例。

重启不会自动把中断任务标成成功。已完成素材与旧版仍可使用，重新发起任务可命中相同输入缓存。大文件下载与模型加载日志保存在独立运行目录，不提交 Git。

## 常见问题

- 生成报模型不可达：确认 `/v1/models`、模型 alias 和 SSH 隧道。
- CUDA unavailable：确认安装了 `+cu130` wheel，检查 `torch.cuda.is_available()`；不要以 CPU 结果冒充 Spark GPU 结果。
- 视频依赖首帧变化：新图片会使旧视频过期；重新生成后再导出。
- 保存冲突：另一个操作已产生新修订，刷新后重新执行。
