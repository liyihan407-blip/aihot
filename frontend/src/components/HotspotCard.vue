<script setup lang="ts">
import { ref } from 'vue';
import { ArrowUpRight, Bookmark, ChevronDown, MessageSquare, ThumbsUp } from '../icons';
import type { Hotspot } from '../types';
import { sourceNames, sourceColors, importanceNames, date } from '../api';
defineProps<{item:Hotspot;index:number}>();
defineEmits<{bookmark:[item:Hotspot]}>();
const expanded = ref(false);
</script>
<template>
  <article class="hotspot-card">
    <div class="article-number">{{ String(index+1).padStart(2,'0') }}</div>
    <div class="article-main">
      <div class="article-meta"><span class="source-mark" :style="{'--source':sourceColors[item.article.source] || '#59636b'}">{{ (sourceNames[item.article.source] || item.article.source).slice(0,1) }}</span><strong>{{ sourceNames[item.article.source] || item.article.source }}</strong><span class="meta-dot">·</span><span>{{ item.article.publishedAt ? date(item.article.publishedAt) : '发布时间未知' }}</span><span class="importance" :class="item.analysis.importance">{{ importanceNames[item.analysis.importance] || '一般' }}</span></div>
      <h3><a :href="item.article.url" target="_blank" rel="noopener noreferrer">{{ item.article.title }}<ArrowUpRight :size="17"/></a></h3>
      <p class="article-summary">{{ item.analysis.summary || item.article.content || '该来源没有提供摘要，可打开原始链接查看。' }}</p>
      <div class="article-footer"><span class="mode-badge" :class="item.analysis.mode">{{ item.analysis.mode==='ai' ? 'AI 相关性分析' : item.analysis.mode==='legacy' ? '历史导入' : item.analysis.mode==='degraded' ? 'AI 失败 · 规则匹配' : '规则匹配' }}</span><span class="score">相关性 <b>{{ item.analysis.relevance }}</b></span><span v-if="item.article.likes" class="engagement"><ThumbsUp :size="13"/>{{ item.article.likes.toLocaleString() }}</span><span v-if="item.article.comments" class="engagement"><MessageSquare :size="13"/>{{ item.article.comments.toLocaleString() }}</span><button class="reason-button" @click="expanded=!expanded" :aria-expanded="expanded">分析依据<ChevronDown :size="14" :class="{rotated:expanded}"/></button></div>
      <div v-if="expanded" class="analysis-detail"><p><strong>关联说明</strong>{{ item.analysis.reason }}</p><p><strong>分析置信度</strong>{{ item.analysis.confidence }} / 100<span>（与相关性分数含义不同）</span></p><p v-if="item.article.author"><strong>原始作者</strong>{{ item.article.author }}</p><p><strong>发现时间</strong>{{ date(item.createdAt) }}</p><p class="fine-print">分析基于来源摘要，不代表事实核验。请结合原文判断。</p></div>
    </div>
    <button class="icon-button bookmark" :class="{saved:item.bookmarked}" :aria-label="item.bookmarked?'取消收藏':'收藏热点'" :aria-pressed="item.bookmarked" @click="$emit('bookmark',item)"><Bookmark :size="18" :fill="item.bookmarked?'currentColor':'none'"/></button>
  </article>
</template>
