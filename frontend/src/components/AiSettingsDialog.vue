<script setup lang="ts">
import { ref, watch } from 'vue';
import { Settings2, X } from '../icons';
import type { CustomAiSettings } from '../types';

const props = defineProps<{ settings: CustomAiSettings | null }>();
const emit = defineEmits<{ save: [value: CustomAiSettings]; clear: [] }>();
const dialog = ref<HTMLDialogElement>();
const baseUrl = ref('https://dashscope.aliyuncs.com/compatible-mode/v1');
const model = ref('qwen-plus');
const apiKey = ref('');
const error = ref('');

watch(() => props.settings, value => {
  if (value) {
    baseUrl.value = value.baseUrl;
    model.value = value.model;
    apiKey.value = value.apiKey;
  } else {
    apiKey.value = '';
  }
}, { immediate: true });

function open() {
  error.value = '';
  dialog.value?.showModal();
}

function save() {
  try {
    const url = new URL(baseUrl.value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/+$/, '').endsWith('/v1')) {
      error.value = '请输入以 /v1 结尾的 HTTPS 接口地址，不要包含账号或查询参数。';
      return;
    }
    if (!model.value.trim() || !apiKey.value.trim()) {
      error.value = '请填写模型名称和 API Key。';
      return;
    }
    emit('save', { baseUrl: baseUrl.value.trim().replace(/\/+$/, ''), model: model.value.trim(), apiKey: apiKey.value.trim() });
    dialog.value?.close();
  } catch {
    error.value = '接口地址格式不正确，请检查后重试。';
  }
}

function clear() {
  apiKey.value = '';
  emit('clear');
  dialog.value?.close();
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="dialog">
    <form @submit.prevent="save">
      <div class="dialog-header">
        <span class="dialog-icon"><Settings2 :size="22" /></span>
        <button type="button" class="icon-button" aria-label="关闭 AI 设置" @click="dialog?.close()"><X :size="19" /></button>
      </div>
      <h2>AI 模型设置</h2>
      <p>填写 OpenAI 兼容接口地址、模型名称和你的 API Key，用于当前页面的手动检索。</p>
      <label for="ai-base-url">接口地址（Base URL）</label>
      <input id="ai-base-url" v-model="baseUrl" type="url" autocomplete="url" required maxlength="500" placeholder="https://.../v1" />
      <label for="ai-model">模型名称</label>
      <input id="ai-model" v-model="model" required maxlength="256" placeholder="例如 qwen-plus" />
      <label for="ai-api-key">API Key</label>
      <input id="ai-api-key" v-model="apiKey" type="password" autocomplete="off" required maxlength="512" placeholder="填写你自己的 Key" />
      <p class="dialog-note">设置仅保存在当前浏览器标签页；手动检索时会发送给本项目后端，由后端请求所填平台。关闭标签页后需重新填写。定时监控使用服务器配置。</p>
      <p class="dialog-note">默认支持百炼、硅基流动、OpenRouter 和 OpenAI；其他域名需由管理员在服务器配置中允许。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button v-if="settings" type="button" class="secondary-button" @click="clear">清除设置</button>
        <button type="button" class="secondary-button" @click="dialog?.close()">取消</button>
        <button class="primary-button" type="submit">保存</button>
      </div>
    </form>
  </dialog>
</template>
