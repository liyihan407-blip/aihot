<script setup lang="ts">
import { toRefs } from 'vue';
import { Activity, Bell, Database, Sparkles } from '../icons';
import HotspotCard from '../components/HotspotCard.vue';
import type { Workspace } from '../composables/useWorkspace';

// 接收工作台共享状态和操作，避免页面各自重复请求。
const props = defineProps<{ workspace: Workspace }>();
const {
  config,
  sourceHealth,
  runs,
  statusNames,
  sourceNames,
  sourceColors,
  date,
  message,
  notify,
  loadSources
} = toRefs(props.workspace);
</script>

<template>
          <section class="page-heading"><div><div class="eyebrow">KNOW WHERE IT COMES FROM</div><h1>每条线索，都有来源<span class="heading-dot">.</span></h1><p>查看来源可用情况、分析模式，以及每次检索的真实执行记录。</p></div><button class="secondary-button" @click="loadSources().catch(e=>notify(message(e)))"><Activity :size="16"/>刷新状态</button></section>
          <div class="config-strip"><div><Sparkles :size="19"/><span>AI 分析<strong>{{ config?.aiConfigured?config.provider+' / '+config.model:'未配置 · 使用规则匹配' }}</strong></span></div><div><Database :size="19"/><span>持久化存储<strong>{{ config?.database || '等待连接' }}</strong></span></div><div><Bell :size="19"/><span>重要热点邮件<strong>{{ config?.mailConfigured?'已配置':'未启用' }}</strong></span></div></div>
          <div class="source-grid"><article v-for="(name,id) in sourceNames" :key="id" class="source-card"><div><span class="source-mark large" :style="{'--source':sourceColors[id]}">{{ name.slice(0,1) }}</span><h2>{{ name }}</h2><span class="source-state" :class="sourceHealth.find(s=>s.source===id)?.status || 'unknown'">{{ statusNames[sourceHealth.find(s=>s.source===id)?.status || ''] || '尚未检索' }}</span></div><p>{{ sourceHealth.find(s=>s.source===id)?.message || '使用公开信息入口；实际可用性受网络及平台访问策略影响。' }}</p><span class="source-card-foot">{{ sourceHealth.find(s=>s.source===id) ? '上次返回 '+sourceHealth.find(s=>s.source===id)?.count+' 条 · '+((sourceHealth.find(s=>s.source===id)?.durationMs||0)/1000).toFixed(1)+'s' : '检索后更新状态' }}</span></article></div>
          <section class="feed-panel run-panel"><div class="section-heading"><h2>最近运行记录<span class="count-pill">{{ runs.length }}</span></h2><span class="muted">最近 30 次</span></div><div class="table-scroll" v-if="runs.length"><table><thead><tr><th>检索词</th><th>状态</th><th>聚合 / 分析 / 入库</th><th>执行时间</th><th>说明</th></tr></thead><tbody><tr v-for="run in runs" :key="run.id"><td>{{ run.query_text }}</td><td><span class="source-state" :class="run.status">{{ statusNames[run.status] || run.status }}</span></td><td>{{ run.collected }} / {{ run.analyzed }} / {{ run.saved }}</td><td>{{ date(run.created_at) }}</td><td>{{ run.message || '任务执行中' }}</td></tr></tbody></table></div><div v-else class="empty-state"><Activity :size="28"/><p>完成第一次检索后，运行记录会出现在这里。</p></div></section>
        
</template>
