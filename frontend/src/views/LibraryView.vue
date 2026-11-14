<script setup lang="ts">
import { toRefs } from 'vue';
import { ArrowRight, Bookmark, ChevronLeft, ChevronRight, Layers3, LoaderCircle, Radio, Search, X, Zap } from '../icons';
import HotspotCard from '../components/HotspotCard.vue';
import type { Workspace } from '../composables/useWorkspace';

// 接收工作台共享状态和操作，避免页面各自重复请求。
const props = defineProps<{ workspace: Workspace }>();
const {
  stats,
  library,
  loading,
  filterQuery,
  filterSource,
  filterImportance,
  filterTime,
  filterSort,
  onlySaved,
  keywordFilter,
  sourceNames,
  go,
  loadLibrary,
  bookmark
} = toRefs(props.workspace);
</script>

<template>
          <section class="page-heading"><div><div class="eyebrow">COLLECT YOUR SIGNALS</div><h1>我的热点库<span class="heading-dot">.</span></h1><p>每次发现，都有迹可循。收藏与历史内容，在这里继续探索。</p></div><div class="page-total"><strong>{{ stats?.total || 0 }}</strong><span>条已保存线索</span></div></section>
          <div class="metric-strip"><div><Bookmark :size="18"/><span>我的收藏</span><strong>{{ stats?.bookmarked || 0 }}</strong></div><div><Zap :size="18"/><span>近 24 小时发现</span><strong>{{ stats?.today || 0 }}</strong></div><div><Radio :size="18"/><span>运行中关注</span><strong>{{ stats?.activeMonitors || 0 }}</strong></div></div>
          <form class="library-filters" @submit.prevent="loadLibrary()"><label class="filter-search"><Search :size="17"/><input v-model="filterQuery" placeholder="在历史标题中检索" aria-label="检索历史标题"></label><select v-model="filterSource" aria-label="按来源筛选" @change="loadLibrary()"><option value="">全部来源</option><option v-for="(name,id) in sourceNames" :key="id" :value="id">{{ name }}</option></select><select v-model="filterImportance" aria-label="按重要性筛选" @change="loadLibrary()"><option value="">全部重要性</option><option value="high">重要</option><option value="urgent">紧急</option><option value="medium">值得关注</option><option value="low">一般</option></select><select v-model="filterTime" aria-label="按发现时间筛选" @change="loadLibrary()"><option value="all">全部时间</option><option value="24h">近 24 小时</option><option value="7d">近 7 天</option><option value="30d">近 30 天</option></select><select v-model="filterSort" aria-label="热点库排序" @change="loadLibrary()"><option value="latest">最近发现</option><option value="published">最近发布</option><option value="heat">互动热度</option><option value="relevance">相关性</option><option value="importance">重要性</option></select><button type="button" class="filter-saved" :class="{active:onlySaved}" :aria-pressed="onlySaved" @click="onlySaved=!onlySaved;loadLibrary()"><Bookmark :size="15"/>仅收藏</button><button class="secondary-button" type="submit">筛选</button></form>
          <div v-if="keywordFilter" class="filter-hint">正在查看关注词的内容<button @click="keywordFilter='';loadLibrary()">清除<X :size="13"/></button></div>
          <section class="feed-panel"><div class="section-heading"><h2>已保存线索 <span class="count-pill">{{ library.total }}</span></h2><LoaderCircle v-if="loading" class="spin" :size="18"/></div><HotspotCard v-for="(item,i) in library.items" :key="item.id" :item="item" :index="(library.page-1)*library.size+i" @bookmark="bookmark"/><div v-if="!library.items.length&&!loading" class="empty-state"><Layers3 :size="32"/><h3>这里还没有匹配的内容</h3><p>调整筛选条件，或从一次新的热点检索开始。</p><button class="secondary-button" @click="go('discover')">前往检索<ArrowRight :size="15"/></button></div><div class="pagination" v-if="library.pages>0"><span>共 {{ library.total }} 条 · 第 {{ library.page }} / {{ library.pages }} 页</span><button class="icon-button" aria-label="上一页" :disabled="loading||library.page<=1" @click="loadLibrary(library.page-1)"><ChevronLeft :size="17"/></button><button class="icon-button" aria-label="下一页" :disabled="loading||library.page>=library.pages" @click="loadLibrary(library.page+1)"><ChevronRight :size="17"/></button></div></section>
        
</template>
