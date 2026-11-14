<script setup lang="ts">
import { toRefs } from 'vue';
import { ArrowUpRight, LoaderCircle, Plus, Radio, Search, Trash2 } from '../icons';
import HotspotCard from '../components/HotspotCard.vue';
import type { Workspace } from '../composables/useWorkspace';

// 接收工作台共享状态和操作，避免页面各自重复请求。
const props = defineProps<{ workspace: Workspace }>();
const {
  config,
  keywords,
  searching,
  library,
  keywordFilter,
  actionId,
  busy,
  date,
  go,
  openKeyword,
  editKeyword,
  toggleKeyword,
  scanKeyword,
  confirmDelete
} = toRefs(props.workspace);
</script>

<template>
          <section class="page-heading"><div><div class="eyebrow">KEEP AN EYE ON WHAT'S NEXT</div><h1>让关注，持续发生<span class="heading-dot">.</span></h1><p>设置关键词和检索频率，新内容出现时，第一时间留下一条线索。</p></div><button class="primary-button" @click="openKeyword()"><Plus :size="17"/>添加关注</button></section>
          <div class="info-banner"><Radio :size="17"/><p>{{ config?.schedulerEnabled?'定时监控已开启':'定时监控已关闭，可手动执行扫描' }}。监控检索 Bing、Hacker News、GitHub 和哔哩哔哩；只有 AI 分析通过的新内容会触发通知。</p></div>
          <div v-if="keywords.length" class="keyword-grid"><article class="keyword-card" v-for="k in keywords" :key="k.id"><div class="keyword-card-top"><span class="monitor-icon"><Radio :size="21"/></span><span class="monitor-state" :class="{paused:!k.enabled}">{{ k.enabled?'关注中':'已暂停' }}</span><button class="icon-button" :aria-label="'删除 '+k.term" @click="confirmDelete(k)"><Trash2 :size="16"/></button></div><h2>{{ k.term }}</h2><p>每 {{ k.intervalMinutes }} 分钟检索一次 <button class="text-button" @click="editKeyword(k)">调整</button></p><dl><div><dt>上次执行</dt><dd>{{ date(k.lastRunAt) }}</dd></div><div><dt>下次执行</dt><dd>{{ k.enabled ? date(k.nextRunAt) : '暂停期间不执行' }}</dd></div></dl><div class="keyword-actions"><button class="secondary-button" :disabled="busy||actionId===k.id" @click="scanKeyword(k)"><LoaderCircle v-if="actionId===k.id&&searching" :size="14" class="spin"/><Search v-else :size="14"/>立即扫描</button><button class="text-button" @click="keywordFilter=k.id;go('library')">查看内容<ArrowUpRight :size="14"/></button><button class="switch" :class="{on:k.enabled}" role="switch" :aria-checked="k.enabled" :aria-label="k.term+' 定时监控'" :disabled="actionId===k.id" @click="toggleKeyword(k)"><span></span></button></div></article></div>
          <div v-else class="feed-panel empty-state large"><Radio :size="38"/><h2>你关心什么，我们就关注什么。</h2><p>产品发布、技术趋势、创作者动态，都可以从一个关键词开始。</p><button class="primary-button" @click="openKeyword()"><Plus :size="17"/>添加第一个关注</button></div>
        
</template>
