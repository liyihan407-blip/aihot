<script setup lang="ts">
import { toRefs } from 'vue';
import { ArrowRight, Bell, Check, ChevronLeft, ChevronRight, Zap } from '../icons';
import HotspotCard from '../components/HotspotCard.vue';
import type { Workspace } from '../composables/useWorkspace';

// 接收工作台共享状态和操作，避免页面各自重复请求。
const props = defineProps<{ workspace: Workspace }>();
const {
  stats,
  notices,
  noticePage,
  noticeTotal,
  title,
  date,
  go,
  loadNotices,
  markRead,
  openNotice,
  browserNotifications
} = toRefs(props.workspace);
</script>

<template>
          <section class="page-heading"><div><div class="eyebrow">SOMETHING WORTH YOUR ATTENTION</div><h1>你的信息来信<span class="heading-dot">.</span></h1><p>来自持续关注的新发现。先看重要的，再慢慢探索。</p></div><button class="secondary-button" :disabled="!stats?.unread" @click="markRead('all')"><Check :size="16"/>全部标为已读</button></section><div class="notification-options"><span>{{ stats?.unread || 0 }} 条未读通知</span><button class="text-button" @click="browserNotifications"><Bell :size="14"/>开启浏览器提醒</button></div>
          <section class="feed-panel"><article v-for="n in notices" :key="n.id" class="notice-row" :class="{unread:!n.is_read}"><span class="notice-icon"><Zap :size="19"/></span><button class="notice-content" @click="openNotice(n)"><span>发现新热点 · {{ date(n.created_at) }}</span><h2>{{ n.title }}</h2><p>{{ n.content }}</p></button><button v-if="!n.is_read" class="icon-button" aria-label="标记为已读" @click="markRead(n.id)"><Check :size="18"/></button></article><div v-if="!notices.length" class="empty-state large"><Bell :size="35"/><h2>好消息，值得等待。</h2><p>监控发现新的相关内容后，通知会出现在这里。</p><button class="secondary-button" @click="go('monitors')">管理我的关注<ArrowRight :size="15"/></button></div><div v-if="noticeTotal>20" class="pagination"><span>共 {{ noticeTotal }} 条 · 第 {{ noticePage }} 页</span><button class="icon-button" aria-label="通知上一页" :disabled="noticePage===1" @click="loadNotices(noticePage-1)"><ChevronLeft :size="17"/></button><button class="icon-button" aria-label="通知下一页" :disabled="noticePage*20>=noticeTotal" @click="loadNotices(noticePage+1)"><ChevronRight :size="17"/></button></div></section>
        
</template>
