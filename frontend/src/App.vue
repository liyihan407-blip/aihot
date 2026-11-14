<script setup lang="ts">
import { ref, toRefs } from 'vue';
import { Activity, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight, CircleHelp, LoaderCircle, Menu, Radio, Settings2, SlidersHorizontal, X } from './icons';
import { useWorkspace } from './composables/useWorkspace';
import DiscoverView from './views/DiscoverView.vue';
import LibraryView from './views/LibraryView.vue';
import MonitorsView from './views/MonitorsView.vue';
import NotificationsView from './views/NotificationsView.vue';
import SourcesView from './views/SourcesView.vue';
import AiSettingsDialog from './components/AiSettingsDialog.vue';
import type { CustomAiSettings } from './types';

// 顶层负责导航、共享状态和弹窗；页面内容在 views 中。
const customAi = ref<CustomAiSettings | null>(null);
try {
  const saved = sessionStorage.getItem('aihot-custom-ai');
  if (saved) {
    const value = JSON.parse(saved);
    if (typeof value.baseUrl === 'string' && typeof value.model === 'string' && typeof value.apiKey === 'string') customAi.value = value;
  }
} catch { /* 浏览器禁用存储时仍可在当前页面使用。 */ }
const aiSettingsDialog = ref<InstanceType<typeof AiSettingsDialog>>();
const workspace = useWorkspace(customAi);
const {
  nav,
  route,
  mobileMenu,
  stats,
  connected,
  error,
  toast,
  library,
  keywordDialog,
  deleteDialog,
  authDialog,
  newTerm,
  newInterval,
  newEnabled,
  saving,
  formError,
  editingId,
  deleteTarget,
  token,
  authenticating,
  title,
  go,
  initialize,
  openKeyword,
  saveKeyword,
  deleteKeyword,
  authenticate
} = toRefs(workspace);

function saveAiSettings(value: CustomAiSettings) {
  customAi.value = value;
  try { sessionStorage.setItem('aihot-custom-ai', JSON.stringify(value)); }
  catch { workspace.notify('浏览器无法保存设置，刷新后需要重新填写'); return; }
  workspace.notify('AI 设置已保存，将用于手动检索');
}

function clearAiSettings() {
  customAi.value = null;
  try { sessionStorage.removeItem('aihot-custom-ai'); } catch { /* 当前页面设置仍已清除。 */ }
  workspace.notify('已清除当前标签页的 AI 设置');
}
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="app-shell">
    <aside class="sidebar" :class="{open:mobileMenu}">
      <a class="brand" href="#discover" @click.prevent="go('discover')"><span class="brand-symbol"><Activity :size="23"/></span><span>AIHot<span class="brand-dot">.</span><small>个人热点研究台</small></span></a>
      <div class="workspace-label">WORKSPACE <span>个人版</span></div>
      <nav aria-label="主要导航"><button v-for="n in nav" :key="n.id" class="nav-item" :class="{active:route===n.id}" :aria-current="route===n.id?'page':undefined" @click="go(n.id)"><component :is="n.icon" :size="19"/><span>{{ n.label }}</span><span v-if="n.id==='notifications' && stats?.unread" class="nav-count">{{ stats.unread }}</span><span v-if="n.id==='discover'" class="nav-shortcut">Ctrl K</span></button></nav>
      <div class="sidebar-separator"></div><button class="nav-item" :class="{active:route==='sources'}" @click="go('sources')"><SlidersHorizontal :size="18"/><span>来源与运行</span></button>
      <div class="sidebar-note"><div class="tiny-orbit"><Radio :size="19"/></div><strong>把关注交给 AIHot</strong><p>少一点信息噪声，<br>多一点有价值的发现。</p><button @click="openKeyword()">创建第一个关注<ArrowUpRight :size="14"/></button></div>
      <div class="workspace-user"><div class="avatar">YH</div><div><strong>我的工作空间</strong><small>Stay curious, stay ahead.</small></div><span class="online-dot"></span></div>
    </aside>
    <button v-if="mobileMenu" class="sidebar-scrim" aria-label="关闭导航" @click="mobileMenu=false"></button>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" aria-label="打开导航" @click="mobileMenu=!mobileMenu"><Menu :size="21"/></button><span class="breadcrumb-home">工作空间</span><ChevronRight :size="14"/><strong>{{ title }}</strong></div><div class="topbar-right"><span class="connection"><i :class="{live:connected}"></i>{{ connected?'实时连接':'等待连接' }}</span><button class="ai-settings-button" type="button" @click="aiSettingsDialog?.open()"><Settings2 :size="16"/>AI 设置<span v-if="customAi" class="ai-settings-dot" aria-label="已配置"></span></button><button class="icon-button notification-bell" aria-label="查看通知" @click="go('notifications')"><Bell :size="19"/><span v-if="stats?.unread" class="notification-dot"></span></button><div class="avatar small">YH</div></div></header>
      <main id="main-content" tabindex="-1">
        <div v-if="error" class="error-banner" role="alert"><CircleHelp :size="18"/><span>{{ error }}</span><button @click="initialize">重新连接</button><button class="icon-button" aria-label="关闭提示" @click="error=''" ><X :size="17"/></button></div>

        <DiscoverView v-if="route==='discover'" :workspace="workspace" />

        <LibraryView v-else-if="route==='library'" :workspace="workspace" />

        <MonitorsView v-else-if="route==='monitors'" :workspace="workspace" />

        <NotificationsView v-else-if="route==='notifications'" :workspace="workspace" />

        <SourcesView v-else :workspace="workspace" />
        <footer class="page-footer"><span>AIHot<span class="brand-dot">.</span> 不止追热点，更要看见价值。</span><span>保持好奇，独立判断。</span></footer>
      </main>
    </div>
  </div>

  <AiSettingsDialog ref="aiSettingsDialog" :settings="customAi" @save="saveAiSettings" @clear="clearAiSettings" />
  <dialog ref="keywordDialog" class="dialog"><form @submit.prevent="saveKeyword"><div class="dialog-header"><span class="dialog-icon"><Radio :size="23"/></span><button type="button" class="icon-button" aria-label="关闭添加关注" @click="keywordDialog?.close()"><X :size="19"/></button></div><h2>{{ editingId?'调整这个关注':'添加一个新的关注' }}</h2><p>持续检索你关心的关键词，让新动向主动找到你。</p><label for="keyword-term">关键词</label><input id="keyword-term" v-model="newTerm" :readonly="!!editingId" required maxlength="160" placeholder="例如 Claude Code、AI 编程"><label for="keyword-interval">检索间隔</label><select id="keyword-interval" v-model.number="newInterval"><option :value="5">每 5 分钟</option><option :value="15">每 15 分钟</option><option :value="30">每 30 分钟</option><option :value="60">每小时</option><option :value="360">每 6 小时</option><option :value="1440">每天</option></select><label class="checkbox-label"><input type="checkbox" v-model="newEnabled">保存后开启定时检索</label><p class="dialog-note">启用 AI 时，定时检索会消耗你配置的模型额度。首次执行将在调度器下次检查时开始。</p><p v-if="formError" class="form-error" role="alert">{{ formError }}</p><div class="dialog-actions"><button type="button" class="secondary-button" @click="keywordDialog?.close()">取消</button><button class="primary-button" :disabled="saving"><LoaderCircle v-if="saving" :size="16" class="spin"/>保存关注</button></div></form></dialog>
  <dialog ref="deleteDialog" class="dialog small-dialog"><h2>删除这个关注？</h2><p>「{{ deleteTarget?.term }}」将停止监控，已经保存的热点内容仍然保留。</p><div class="dialog-actions"><button class="secondary-button" @click="deleteDialog?.close()">取消</button><button class="danger-button" :disabled="saving" @click="deleteKeyword">确认删除</button></div></dialog>
  <dialog ref="authDialog" class="dialog small-dialog" @cancel.prevent><form @submit.prevent="authenticate"><span class="dialog-icon"><Settings2 :size="22"/></span><h2>进入你的工作空间</h2><p>这个工作台设置了访问保护，请输入你配置的访问令牌。</p><label for="access-token">访问令牌</label><input id="access-token" v-model="token" type="password" autocomplete="current-password" required><div class="dialog-actions"><button class="primary-button" :disabled="authenticating">{{ authenticating?'正在连接':'进入工作台' }}<ArrowRight :size="16"/></button></div></form></dialog>
  <div v-if="toast" class="toast" role="status"><Check :size="17"/>{{ toast }}<button class="icon-button" aria-label="关闭提示" @click="toast=''"><X :size="15"/></button></div>
</template>
