import { computed, markRaw, nextTick, onMounted, onUnmounted, reactive, ref, watch, type Ref } from 'vue';
import { Bell, Compass, Layers3, Radio } from '../icons';
import { api, body, date, sourceNames, sourceColors, ApiError } from '../api';
import type { Config, Stats, Keyword, Hotspot, Page, SearchResult, SourceStatus, Notice, Run, CustomAiSettings } from '../types';

type View = 'discover' | 'library' | 'monitors' | 'notifications' | 'sources';

// 保存工作台共享状态，并处理页面共同使用的请求、导航与实时连接。
export function useWorkspace(customAi: Ref<CustomAiSettings | null>) {
  // 导航项不会变化，避免把图标组件包装成响应式对象。
  const nav = markRaw([
    { id: 'discover' as View, label: '热点检索', icon: Compass },
    { id: 'library' as View, label: '我的热点库', icon: Layers3 },
    { id: 'monitors' as View, label: '关键词监控', icon: Radio },
    { id: 'notifications' as View, label: '通知中心', icon: Bell }
  ]);
  const route = ref<View>('discover');
  const mobileMenu = ref(false);
  const config = ref<Config>(); const stats = ref<Stats>(); const keywords = ref<Keyword[]>([]);
  const query = ref(''); const result = ref<SearchResult>(); const searching = ref(false); const useAi = ref(true);
  const selectedSources = ref(['bing','hackernews','github','bilibili']);
  const progress = ref(''); const connected = ref(false); const error = ref(''); const toast = ref('');
  const library = ref<Page>({items:[],total:0,page:1,size:12,pages:0}); const loading = ref(false);
  const filterQuery = ref(''); const filterSource = ref(''); const filterImportance = ref(''); const filterTime = ref('all'); const filterSort = ref('latest'); const onlySaved = ref(false); const keywordFilter = ref('');
  const notices = ref<Notice[]>([]); const noticePage = ref(1); const noticeTotal = ref(0);
  const sourceHealth = ref<SourceStatus[]>([]); const runs = ref<Run[]>([]);
  const keywordDialog = ref<HTMLDialogElement>(); const deleteDialog = ref<HTMLDialogElement>(); const authDialog = ref<HTMLDialogElement>();
  const newTerm = ref(''); const newInterval = ref(30); const newEnabled = ref(true); const saving = ref(false); const formError = ref('');
  const editingId=ref('');
  const deleteTarget = ref<Keyword>(); const token = ref(''); const authenticating = ref(false);
  const actionId = ref(''); const searchSort = ref('relevance');
  let libraryRequest=0;
  let socket:WebSocket|undefined, reconnectTimer:number|undefined, toastTimer:number|undefined, pollTimer:number|undefined, disposed=false;

  const title = computed(()=>nav.find(n=>n.id===route.value)?.label || '来源与运行');
  const busy = computed(()=>searching.value || !!config.value?.running);
  const displayItems = computed(() => {
    const items = [...(result.value?.items || library.value.items)];
    const sorted = items.sort((a, b) => {
      if (searchSort.value === 'heat') return b.heat - a.heat;
      if (searchSort.value === 'latest') return b.createdAt.localeCompare(a.createdAt);
      return b.analysis.relevance - a.analysis.relevance;
    });
    return result.value ? sorted : sorted.slice(0, 6);
  });
  const goodSources = computed(()=>sourceHealth.value.filter(s=>s.status==='ok'||s.status==='empty').length);
  const failedSources = computed(()=>result.value?.sources.filter(s=>s.status==='error'||s.status==='partial') || []);
  const statusNames:Record<string,string>={ok:'可用',empty:'暂无匹配',error:'访问失败',partial:'部分成功',completed:'已完成',failed:'失败',running:'执行中',interrupted:'已中断'};

  function message(e:unknown) {return e instanceof Error ? e.message : '请求未完成，请稍后重试'}
  function focusSearch(){document.getElementById('search-input')?.focus()}
  function shortcut(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();go('discover');nextTick(focusSearch)}}
  function notify(text:string) {toast.value=text; clearTimeout(toastTimer); toastTimer=window.setTimeout(()=>toast.value='',4500)}
  function go(view:View) {route.value=view;location.hash=view;mobileMenu.value=false;nextTick(()=>document.getElementById('main-content')?.focus())}
  function onHash() {const value=location.hash.slice(1) as View; route.value=[...nav.map(n=>n.id),'sources'].includes(value)?value:'discover'}
  async function refreshSummary() {
    const values=await Promise.all([api<Config>('/config'),api<Stats>('/stats'),api<Keyword[]>('/keywords')]);
    config.value=values[0];stats.value=values[1];keywords.value=values[2];
  }
  // 多次筛选请求并发时，只使用最后一次请求的结果，避免旧数据覆盖新数据。
  async function loadLibrary(page = 1) {
    const request = ++libraryRequest;
    loading.value = true;
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: '12',
        q: filterQuery.value,
        source: filterSource.value,
        importance: filterImportance.value,
        timeRange: filterTime.value,
        sort: filterSort.value,
        bookmarked: String(onlySaved.value),
        keywordId: keywordFilter.value
      });
      const data = await api<Page>('/hotspots?' + params);
      if (request === libraryRequest) {
        library.value = data;
        if (page > 1 && page > data.pages) await loadLibrary(Math.max(1, data.pages));
      }
    } catch (e) {
      if (request === libraryRequest) error.value = message(e);
    } finally {
      if (request === libraryRequest) loading.value = false;
    }
  }
  async function loadNotices(page=1) {
    const data=await api<{items:Notice[];total:number;unread:number}>('/notifications?page='+page);notices.value=data.items;noticeTotal.value=data.total;noticePage.value=page;
  }
  async function loadSources() {
    const data=await api<{source:string;status:string;item_count:number;duration_ms:number;message:string}[]>('/sources');
    sourceHealth.value=data.map(s=>({source:s.source,status:s.status,count:s.item_count,durationMs:s.duration_ms,message:s.message}));runs.value=await api<Run[]>('/runs');
  }
  async function initialize() {
    error.value='';
    try {await refreshSummary(); await Promise.all([loadLibrary(),loadSources()]);connect()}
    catch(e){if (!(e instanceof ApiError && e.status===401)) error.value='后端暂不可用。请确认 Java 服务已启动，且 .env 中的 MySQL 连接配置正确。'}
  }
  /** 发起一次手动检索；term 未传入时使用输入框中的关键词。 */
  async function runSearch(term = query.value) {
    if (busy.value) return;
    const value = term.trim();
    if (!value) {
      document.getElementById('search-input')?.focus();
      return;
    }
    if (!selectedSources.value.length) {
      notify('请至少选择一个信息源');
      return;
    }
    query.value = value;
    error.value = '';
    searching.value = true;
    progress.value = '正在连接信息源';
    go('discover');
    try {
      result.value = await api<SearchResult>('/search', body({
        query: value,
        sources: selectedSources.value,
        useAi: useAi.value,
        ...(useAi.value && customAi.value ? { customAi: customAi.value } : {})
      }));
      await Promise.all([refreshSummary(), loadSources()]);
      notify(`检索完成，保留 ${result.value.items.length} 条相关内容`);
    } catch (e) {
      error.value = message(e);
    } finally {
      searching.value = false;
      progress.value = '';
    }
  }
  function toggleSource(source:string){selectedSources.value=selectedSources.value.includes(source)?selectedSources.value.filter(s=>s!==source):[...selectedSources.value,source]}
  async function bookmark(item:Hotspot){try{await api('/hotspots/'+item.id+'/bookmark',body({bookmarked:!item.bookmarked},'PATCH'));item.bookmarked=!item.bookmarked;await refreshSummary();notify(item.bookmarked?'已加入收藏':'已取消收藏');if(onlySaved.value)await loadLibrary(library.value.page)}catch(e){notify(message(e))}}
  function openKeyword(term=''){editingId.value='';newTerm.value=term;newInterval.value=30;newEnabled.value=true;formError.value='';keywordDialog.value?.showModal()}
  function editKeyword(k:Keyword){openKeyword(k.term);editingId.value=k.id;newInterval.value=k.intervalMinutes;newEnabled.value=k.enabled}
  async function saveKeyword(){saving.value=true;formError.value='';try{if(editingId.value)await api('/keywords/'+editingId.value,body({intervalMinutes:newInterval.value,enabled:newEnabled.value},'PATCH'));else await api('/keywords',body({term:newTerm.value.trim(),intervalMinutes:newInterval.value,enabled:newEnabled.value}));keywordDialog.value?.close();await refreshSummary();notify('监控词已保存')}catch(e){formError.value=message(e)}finally{saving.value=false}}
  async function toggleKeyword(k:Keyword){actionId.value=k.id;try{await api('/keywords/'+k.id,body({enabled:!k.enabled},'PATCH'));await refreshSummary()}catch(e){notify(message(e))}finally{actionId.value=''}}
  async function scanKeyword(k:Keyword){if(busy.value)return;actionId.value=k.id;searching.value=true;progress.value='正在检索「'+k.term+'」';try{result.value=await api<SearchResult>('/keywords/'+k.id+'/scan',body({}));await Promise.all([refreshSummary(),loadSources()]);query.value=k.term;go('discover');notify('本次监控扫描已完成')}catch(e){notify(message(e))}finally{searching.value=false;actionId.value='';progress.value=''}}
  function confirmDelete(k:Keyword){deleteTarget.value=k;deleteDialog.value?.showModal()}
  async function deleteKeyword(){if(!deleteTarget.value)return;saving.value=true;try{await api('/keywords/'+deleteTarget.value.id,{method:'DELETE'});deleteDialog.value?.close();await refreshSummary();notify('已删除监控词，热点历史仍保留')}catch(e){notify(message(e))}finally{saving.value=false}}
  async function markRead(id:string){try{await api('/notifications/'+id+'/read',body({},'PATCH'));await Promise.all([loadNotices(noticePage.value),refreshSummary()])}catch(e){notify(message(e))}}
  async function openNotice(n:Notice){try{if(n.hotspot_id){const item=await api<Hotspot>('/hotspots/'+n.hotspot_id);result.value={runId:'',query:item.query,expandedTerms:[],items:[item],sources:[],collected:1,analyzed:0,cached:1,filtered:0,deferred:0,mode:item.analysis.mode,finishedAt:item.createdAt};query.value=item.query;go('discover')}await markRead(n.id)}catch(e){notify(message(e))}}
  function askAuth(){if(!authDialog.value?.open)authDialog.value?.showModal()}
  async function authenticate(){authenticating.value=true;sessionStorage.setItem('aihot-token',token.value);try{await api('/config');authDialog.value?.close();await initialize()}catch(e){notify(message(e))}finally{authenticating.value=false}}
  // WebSocket 负责展示任务进度和通知，断线后按原来的间隔重连。
  function connect(){
    if(disposed||socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return;
    const access=sessionStorage.getItem('aihot-token');
    socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws${access?'?token='+encodeURIComponent(access):''}`);
    socket.onopen=()=>connected.value=true;
    socket.onmessage=event=>{try{const e=JSON.parse(event.data);if(e.type==='progress'){progress.value=e.data.message;if(config.value)config.value.running=true;}if(e.type==='notification'){notify('发现新热点：'+e.data.article.title);refreshSummary().catch(()=>{});if('Notification'in window&&Notification.permission==='granted')new Notification('AIHot · 新热点',{body:e.data.article.title})}if(e.type==='completed'||e.type==='failed'){if(config.value)config.value.running=false;loadSources().catch(()=>{});if(!searching.value){progress.value='';loadLibrary().catch(()=>{})}}if(e.type==='mail-error')notify(e.data.message)}catch{/* 忽略非业务消息 */}};
    socket.onclose=()=>{connected.value=false;if(!disposed)reconnectTimer=window.setTimeout(connect,5000)};
  }
  async function browserNotifications(){if(!('Notification'in window)){notify('当前浏览器不支持系统通知');return}const state=await Notification.requestPermission();notify(state==='granted'?'已开启浏览器通知':'未开启系统通知，你仍可查看站内通知')}
  watch(route,async view=>{error.value='';try{if(view==='library')await loadLibrary();if(view==='notifications')await loadNotices();if(view==='sources')await loadSources()}catch(e){error.value=message(e)}});
  onMounted(()=>{onHash();window.addEventListener('hashchange',onHash);window.addEventListener('aihot-auth',askAuth);window.addEventListener('keydown',shortcut);initialize().then(()=>{if(route.value==='notifications')loadNotices().catch(()=>{})});pollTimer=window.setInterval(()=>refreshSummary().catch(()=>{}),30000)});
  onUnmounted(()=>{disposed=true;socket?.close();clearTimeout(reconnectTimer);clearTimeout(toastTimer);clearInterval(pollTimer);window.removeEventListener('hashchange',onHash);window.removeEventListener('aihot-auth',askAuth);window.removeEventListener('keydown',shortcut)});

  return reactive({ nav, route, mobileMenu, config, customAi, stats, keywords, query, result, searching, useAi, selectedSources, progress, connected, error, toast, library, loading, filterQuery, filterSource, filterImportance, filterTime, filterSort, onlySaved, keywordFilter, notices, noticePage, noticeTotal, sourceHealth, runs, keywordDialog, deleteDialog, authDialog, newTerm, newInterval, newEnabled, saving, formError, editingId, deleteTarget, token, authenticating, actionId, searchSort, title, busy, displayItems, goodSources, failedSources, statusNames, sourceNames, sourceColors, date, message, focusSearch, notify, go, refreshSummary, loadLibrary, loadNotices, loadSources, initialize, runSearch, toggleSource, bookmark, openKeyword, saveKeyword, editKeyword, toggleKeyword, scanKeyword, confirmDelete, deleteKeyword, markRead, openNotice, authenticate, browserNotifications });
}

export type Workspace = ReturnType<typeof useWorkspace>;
