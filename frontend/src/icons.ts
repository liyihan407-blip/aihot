import { defineComponent, h } from 'vue';
// 本地图标组件，无外部字体和图标服务依赖。
const paths:Record<string,string[]>={
  Activity:['M3 12h4l3-8 4 16 3-8h4'],ArrowRight:['M4 12h16m-6-6 6 6-6 6'],ArrowUpRight:['M6 18 18 6M6 6h12v12'],
  ArrowDownWideNarrow:['M4 4v16m-3-3 3 3 3-3M10 5h11M10 11h8M10 17h5'],ChevronLeft:['m15 5-7 7 7 7'],ChevronRight:['m9 5 7 7-7 7'],ChevronDown:['m5 9 7 7 7-7'],
  Check:['m5 12 4 4L19 6'],X:['m6 6 12 12M6 18 18 6'],Plus:['M12 4v16M4 12h16'],Menu:['M4 6h16M4 12h16M4 18h16'],
  Search:['M16 16 21 21','M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],Bookmark:['M6 3h12v18l-6-4-6 4Z'],
  Bell:['M5 17h14l-2-4V8a5 5 0 0 0-10 0v5Zm5 3h4'],Radio:['M8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14','M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0'],
  Compass:['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','m16 8-3 5-5 3 3-5Z'],Layers3:['m12 3 10 5-10 5L2 8Zm-10 10 10 5 10-5M2 18l10 5 10-5'],
  Database:['M3 6v12c0 5 18 5 18 0V6M3 12c0 5 18 5 18 0','M21 6c0 5-18 5-18 0s18-5 18 0'],
  Globe2:['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18'],
  SlidersHorizontal:['M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11M8 3v6m6 0v6m-8 0v6'],
  Settings2:['M3 7h18M3 17h18','M10 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  Sparkles:['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4'],
  Zap:['m13 2-9 12h7l-1 8 10-13h-7Z'],Trash2:['M3 6h18M5 6l1 15h12l1-15M9 6V3h6v3M10 10v7m4-7v7'],
  LoaderCircle:['M21 12a9 9 0 1 1-9-9'],CircleHelp:['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01'],
  MessageSquare:['M21 3H3v15h5l4 4 4-4h5Z'],ThumbsUp:['M3 10h4v11H3ZM7 10l5-8c3 1 1 6 1 6h7l-2 13H7Z']
};
function icon(name:string){return defineComponent({name,props:{size:{type:[Number,String],default:24},fill:{type:String,default:'none'}},setup(props,{attrs}){return()=>h('svg',{...attrs,width:props.size,height:props.size,viewBox:'0 0 24 24',fill:props.fill,stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'},paths[name]?.map(d=>h('path',{d})))}})}
export const Activity=icon('Activity'),ArrowRight=icon('ArrowRight'),ArrowUpRight=icon('ArrowUpRight'),ArrowDownWideNarrow=icon('ArrowDownWideNarrow'),ChevronLeft=icon('ChevronLeft'),ChevronRight=icon('ChevronRight'),ChevronDown=icon('ChevronDown'),Check=icon('Check'),X=icon('X'),Plus=icon('Plus'),Menu=icon('Menu'),Search=icon('Search'),Bookmark=icon('Bookmark'),Bell=icon('Bell'),Radio=icon('Radio'),Compass=icon('Compass'),Layers3=icon('Layers3'),Database=icon('Database'),Globe2=icon('Globe2'),SlidersHorizontal=icon('SlidersHorizontal'),Settings2=icon('Settings2'),Sparkles=icon('Sparkles'),Zap=icon('Zap'),Trash2=icon('Trash2'),LoaderCircle=icon('LoaderCircle'),CircleHelp=icon('CircleHelp'),MessageSquare=icon('MessageSquare'),ThumbsUp=icon('ThumbsUp');
