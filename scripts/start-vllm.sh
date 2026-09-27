#!/usr/bin/env bash
# Reproduce the serving flags used on the submission Spark. Prerequisite:
# an ARM64/GB10-compatible vLLM environment and the matching model checkpoint.
set -euo pipefail
: "${VLLM_ENV:?Set VLLM_ENV to the vLLM virtual environment directory}"
: "${MODEL_DIR:?Set MODEL_DIR to the Qwen3.8-27B-NVFP4 checkpoint directory}"
: "${VLLM_API_KEY:?Set a private API key; never commit it}"
test -x "$VLLM_ENV/bin/vllm"
test -f "$MODEL_DIR/chat_template.jinja"
export CUDA_HOME="${CUDA_HOME:-/usr/local/cuda}"
export VIRTUAL_ENV="$VLLM_ENV"
export PATH="$VLLM_ENV/bin:$CUDA_HOME/bin:$PATH"
# Dev control routes are not assumed to require the ordinary API key.
# Keep loopback binding. Expose the application through SSH forwarding only.
export VLLM_SERVER_DEV_MODE=1
exec "$VLLM_ENV/bin/vllm" serve "$MODEL_DIR" \
  --host 127.0.0.1 --port 8000 --served-model-name qwen3.8-27b \
  --api-key "$VLLM_API_KEY" --trust-remote-code --enable-sleep-mode \
  --max-model-len 32768 --max-num-seqs 2 --max-num-batched-tokens 4096 \
  --gpu-memory-utilization 0.45 --enable-chunked-prefill --enable-prefix-caching \
  --quantization compressed-tensors --kv-cache-dtype fp8 \
  --speculative-config '{"method":"mtp","num_speculative_tokens":5}' \
  --reasoning-parser qwen3 --tool-call-parser qwen3_xml --enable-auto-tool-choice \
  --chat-template "$MODEL_DIR/chat_template.jinja"
