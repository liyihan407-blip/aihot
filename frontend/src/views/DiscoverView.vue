<script setup lang="ts">
import { toRefs } from 'vue';
import { ArrowDownWideNarrow, ArrowRight, ArrowUpRight, Check, ChevronRight, Globe2, LoaderCircle, Plus, Radio, Search, Sparkles } from '../icons';
import HotspotCard from '../components/HotspotCard.vue';
import type { Workspace } from '../composables/useWorkspace';

// 接收工作台共享状态和操作，避免页面各自重复请求。
const props = defineProps<{ workspace: Workspace }>();
const {
  config,
  customAi,
  keywords,
  query,
  result,
  searching,
  useAi,
  selectedSources,
  progress,
  library,
  sourceHealth,
  searchSort,
  busy,
  displayItems,
  goodSources,
  failedSources,
  sourceNames,
  sourceColors,
  message,
  focusSearch,
  go,
  runSearch,
  toggleSource,
  bookmark,
  openKeyword
} = toRefs(props.workspace);
</script>

<template>
          <section class="hero"><div class="eyebrow"><span></span>YOUR SIGNAL, NOT THE NOISE</div><h1>让重要的信息，<span>先找到你。</span></h1><p>连接分散的线索，发现值得关注的新动向。你的下一次灵感，从这里开始。</p><div class="hero-orbit" aria-hidden="true"><div></div><div></div><Radio :size="36"/><i></i></div></section>
          <section class="search-panel" aria-label="多源热点检索">
            <form class="search-form" @submit.prevent="runSearch()"><Search :size="23"/><label for="search-input" class="sr-only">检索关键词</label><input id="search-input" v-model="query" maxlength="160" autocomplete="off" placeholder="搜索一个产品、人物，或你正在关注的事…" :disabled="searching"><button class="primary-button search-submit" :disabled="busy"><LoaderCircle v-if="busy" :size="17" class="spin"/><ArrowRight v-else :size="18"/><span>{{ busy?'检索中':'开始检索' }}</span></button></form>
            <div class="search-options"><span class="source-label"><Globe2 :size="14"/>检索来源</span><div class="source-choices"><button v-for="(name,id) in sourceNames" :key="id" class="source-chip" :class="{selected:selectedSources.includes(String(id))}" :aria-pressed="selectedSources.includes(String(id))" @click="toggleSource(String(id))"><span class="source-dot" :style="{background:sourceColors[id]}"></span>{{ name }}<Check v-if="selectedSources.includes(String(id))" :size="12"/></button></div><label class="ai-toggle"><input type="checkbox" v-model="useAi"><Sparkles :size="14"/>AI 分析</label></div>
          </section>
          <div class="search-suggestions"><span>试试这些</span><button v-for="term in ['AI 编程','Claude Code','开源 Agent','机器人']" :key="term" :disabled="busy" @click="runSearch(term)">{{ term }}<ArrowUpRight :size="12"/></button><span class="analysis-status"><span :class="['status-dot',customAi||config?.aiConfigured?'green':'amber']"></span>{{ customAi?'已配置个人 AI':config?.aiConfigured?'AI 已配置':'未配置 AI 时使用规则匹配' }}</span></div>
          <div v-if="busy" class="progress-banner" role="status"><LoaderCircle :size="18" class="spin"/><span>{{ progress || '后台正在执行检索任务' }}</span><small>你可以切换页面，结果会保存到热点库。</small></div>
          <div class="content-grid">
            <section class="feed-panel"><div class="section-heading"><div><span class="section-kicker">{{ result?'SEARCH RESULTS':'YOUR DISCOVERY FEED' }}</span><h2>{{ result?'「'+result.query+'」的检索结果':'值得留意的新线索' }}<span class="count-pill">{{ result?result.items.length:library.total }}</span></h2></div><label class="sort-label"><ArrowDownWideNarrow :size="15"/><select v-model="searchSort" aria-label="检索结果排序"><option value="relevance">相关性优先</option><option value="heat">互动热度</option><option value="latest">最近发现</option></select></label></div>
              <div v-if="result" class="result-overview"><span>聚合 <b>{{ result.collected }}</b> 条</span><span>分析 {{ result.analyzed }} 条</span><span>复用 {{ result.cached }} 条</span><span>过滤 {{ result.filtered }} 条</span><span v-if="result.deferred">预算外 {{ result.deferred }} 条</span><button @click="openKeyword(result.query)"><Plus :size="13"/>持续关注</button></div>
              <div v-if="result?.expandedTerms.length" class="expansion-line"><Sparkles :size="13"/><span>匹配词</span><span v-for="term in result.expandedTerms" :key="term">{{ term }}</span></div>
              <details v-if="failedSources.length" class="source-errors"><summary>{{ failedSources.length }} 个来源未完全返回，查看原因</summary><p v-for="source in failedSources" :key="source.source"><strong>{{ sourceNames[source.source] }}</strong>{{ source.message }}</p></details>
              <div v-if="displayItems.length" class="article-list"><HotspotCard v-for="(item,i) in displayItems" :key="item.id" :item="item" :index="i" @bookmark="bookmark"/></div>
              <div v-else class="empty-discovery"><div class="empty-illustration" aria-hidden="true"><div class="empty-ring"></div><Search :size="34"/><span class="spark-one"></span><span class="spark-two"></span></div><h3>{{ result?'暂未找到符合条件的内容':'好奇心，是发现的起点' }}</h3><p>{{ result?'试试更具体的关键词，或查看来源状态。检索结果不会用示例内容填充。':'输入你关心的话题，从多个来源捕捉真实信息。你的检索结果会在这里汇集。' }}</p><button class="text-button" @click="result?go('sources'):focusSearch()">{{ result?'查看来源状态':'开始你的第一次检索' }}<ArrowRight :size="16"/></button></div>
              <button v-if="displayItems.length" class="feed-more" @click="go('library')">前往热点库<ArrowRight :size="15"/></button>
              <div class="feed-footnote"><Sparkles :size="13"/>AI 分析帮助筛选线索，事实仍需回到原始来源核对。</div>
            </section>
            <aside class="right-rail"><section class="rail-panel watch-panel"><div class="rail-heading"><h2><Radio :size="17"/>我的关注</h2><button class="icon-button" aria-label="添加监控词" @click="openKeyword()"><Plus :size="18"/></button></div><div v-if="keywords.length" class="mini-keywords"><button v-for="k in keywords.slice(0,4)" :key="k.id" @click="query=k.term;go('monitors')"><span class="keyword-dot" :class="{paused:!k.enabled}"></span><span>{{ k.term }}<small>{{ k.enabled?'每 '+k.intervalMinutes+' 分钟更新':'已暂停' }}</small></span><ChevronRight :size="14"/></button></div><div v-else class="mini-empty"><p>把常搜的关键词变成关注，<br>新线索出现时及时知道。</p><button class="secondary-button" @click="openKeyword()"><Plus :size="15"/>添加关注</button></div><button v-if="keywords.length" class="rail-link" @click="go('monitors')">管理全部关注<ArrowRight :size="14"/></button></section>
              <section class="daily-note"><div class="eyebrow">A LITTLE LESS SCROLLING.</div><h2>把时间留给思考，<br>把检索交给这里。</h2><p>从分散的信息里，<br>找到属于你的那条线索。</p><div class="note-lines" aria-hidden="true"><span></span><span></span><span></span><span></span><i></i></div><span class="note-footer">AIHOT / FIND WHAT MATTERS</span></section>
              <section class="rail-panel source-overview"><div class="rail-heading"><h2><Globe2 :size="17"/>来源概况</h2><button class="icon-button" aria-label="查看来源详情" @click="go('sources')"><ArrowUpRight :size="16"/></button></div><div class="source-mini-grid"><span v-for="(name,id) in sourceNames" :key="id"><i :style="{background:sourceColors[id]}"></i>{{ name }}</span></div><p>{{ sourceHealth.length ? goodSources+' 个来源最近访问正常' : '来源将在检索后记录可用状态' }}</p></section>
            </aside>
          </div>
        
</template>
