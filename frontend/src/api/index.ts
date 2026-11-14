// 统一处理接口请求、访问令牌、超时和后端返回的错误。
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** path 为 /api 后面的地址，返回值按调用方指定的类型解析。 */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 600000);
  try {
    const token = sessionStorage.getItem('aihot-token');
    const response = await fetch('/api' + path, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-AIHot-Token': token } : {}),
        ...options.headers
      }
    });
    if (response.status === 401) window.dispatchEvent(new Event('aihot-auth'));
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new ApiError(data?.error || '请求未完成，请稍后重试', response.status);
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('请求超时，请查看任务记录后重试');
    throw e;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const body = (data: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(data) });
export const sourceNames:Record<string,string> = {google:'Google News',bing:'Bing',duckduckgo:'DuckDuckGo',hackernews:'Hacker News',github:'GitHub',weixin:'搜狗微信',bilibili:'哔哩哔哩',weibo:'微博'};
export const sourceColors:Record<string,string> = {google:'#4285a5',bing:'#267575',duckduckgo:'#bd582b',hackernews:'#bc5708',github:'#3d454f',weixin:'#32854f',bilibili:'#b64b73',weibo:'#b94839'};
export const importanceNames:Record<string,string> = {low:'一般',medium:'值得关注',high:'重要',urgent:'紧急'};
export function date(value?:string) { if (!value) return '尚未执行'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '时间未知' : d.toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
