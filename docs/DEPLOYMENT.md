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

下载 `unsloth/Qwen3.6-35B-A3B-GGUF` 的 `Qwen3.6-35B-A3B-UD-Q4_K_M.gguf`。核查 revision `a483e9e6cbd595906af30beda3187c2663a1118c`；文件 SHA256 为 `ac0e2c1189e055faa36eff361580e79c5bd6f8e76bffb4ce547f167d53e31a61`，大小 22,134,528,992 字节。镜像下载后应核对同一哈希。

```bash
./llama.cpp/build/bin/llama-server \
  --model /absolute/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf \
  --alias mujian-director --host 127.0.0.1 --port 8088 \
  --ctx-size 32768 --parallel 1 --n-gpu-layers 99 --jinja \
  --chat-template-kwargs '{"enable_thinking":false}'
```

先确认 `/health` 返回 ready，且工具调用响应符合预期。版本、上下文和启动参数均影响速度。最终实测参数以 evidence 为准。

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
