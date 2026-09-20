# 单台 DGX Spark 部署

以下路径均为独立项目目录示例，不会覆盖系统模型或修改现有业务服务。远程主机地址和凭证不写入仓库。

## 1. 案件模型

在 Spark 上构建已固定版本的 llama.cpp。已在本次机器编译成功的版本：`b11062`，提交 `3cf03257f219afbe7334045ff7c6a06ac68c627d`。

```bash
git clone --depth 1 --branch b11062 https://github.com/ggml-org/llama.cpp.git
export PATH=/usr/local/cuda/bin:$PATH
cmake -S llama.cpp -B llama.cpp/build \
  -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=121a-real \
  -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF
cmake --build llama.cpp/build --target llama-server --config Release -j 12
```

本次已运行的案件模型是 `Qwen/Qwen3-Next-80B-A3B-Thinking`。原始权重来自机器已有目录，使用同一份 llama.cpp 转为 F16 GGUF，再量化为 Q4_K_M。原目录保持不变；生成的 GGUF 约 47,258.42 MiB，平均 4.87 BPW。自转换文件 SHA256：`1624acebd3e14f320d5e9c9dd8a2c78698ee5fa15e7e6f06e81077c6444a4c49`。

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

Nemotron-3-Nano-30B-A3B 的自转换 Q4_K_M 版本已验证 GPU 推理和工具调用，但在本次中文案件任务中多次失败，故未作为默认编剧。Qwen3.6-35B-A3B 的 22 GB GGUF 是另一个候选，目前下载已暂停，尚未加载验证；不得把它的候选配置称作已通过验收。

## 内存调度

在同一台 Spark 使用较大语言模型与视频模型时，启用：

```dotenv
GPU_EXCLUSIVE=true
LLM_WAIT_FOR_SLEEP=true
LLAMA_ADMIN_URL=http://127.0.0.1:8088
```

开始本地 Agent 作业前，工作台调用素材服务 `/unload` 释放驻留的扩散模型与 CUDA 缓存。开始视频作业前，工作台查询 llama.cpp `/props`，确认 `is_sleeping=true` 再提交；必须同时配置上面的 `--sleep-idle-seconds 30`。图片与视频、Agent 任务共用一个队列。该策略交换了模型驻留速度与可用内存，冷加载耗时不能从端到端成绩里删除。

健康检查不会把缓存结果冒充新生成。若未配置兼容的 llama.cpp，不启用此保护选项；较小模型可采用常驻方式。不要同时运行多个使用同一数据目录的工作台进程。

## 2. 本地图片与视频

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

当前锁定的 Diffusers 0.35.2 在 Wan 2.2 VAE 分块模式存在 patchify 不匹配，首轮实测出现 12/3 通道错误；当前明确关闭 VAE tiling，使用普通路径，并在作业中记录。首次还缺少 ftfy，现已固定为 6.3.1。不得在同一环境中随意启用旧版 tiling；升级需重新验证。

`GET /health` 返回 GPU、当前加载的任务类型与 busy。`POST /jobs` 创建异步作业，`GET /jobs/:id` 读取进度与产物，`POST /jobs/:id/cancel` 在采样步边界取消。模型加载本身不保证可立即取消。图片与视频模型在切换时释放旧模型，应用层一次只调度一个重任务。

## 3. 工作台

Spark 自带 Node 18 不能运行本版本 Pi，需要独立安装 Node ≥22.19。在安装目录设置 PATH，避免替换系统 Node。

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

## 4. 远程访问

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
- H3：此版本尚未复现，不能直接把本基线配置替换为 H3。需单独验证其权重许可、依赖、内存与参考人物效果。
