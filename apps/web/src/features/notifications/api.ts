export interface NotificationItem { id:string;type:string;actor?:{id:string;name:string};target:{type:string;id:string};readAt?:string;createdAt:string; }
function csrf():string{return document.cookie.split(';').map((value)=>value.trim()).find((value)=>value.startsWith('bliver_csrf='))?.slice(12)??'';}
async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(`/api/v1${path}`,{credentials:'include',...init,headers:{...(init?.body?{'content-type':'application/json'}:{}),...(init?.method&&init.method!=='GET'?{'x-csrf-token':csrf()}:{}),...init?.headers}});if(!response.ok)throw new Error(`Notification request failed (${response.status})`);if(response.status===204)return undefined as T;return response.json() as Promise<T>;}
export const fetchNotifications=()=>request<{items:NotificationItem[];unreadCount:number;nextCursor?:string|null}>('/notifications');
export const readNotification=(id:string)=>request<void>(`/notifications/${id}/read`,{method:'POST'});
export const readAllNotifications=()=>request<void>('/notifications/read-all',{method:'POST'});
export const fetchNotificationPreferences=()=>request<{reactions:boolean;comments:boolean;social:boolean;messages:boolean;moderation:boolean;push:boolean}>('/notifications/preferences');
export const saveNotificationPreferences=(value:Record<string,boolean>)=>request('/notifications/preferences',{method:'PUT',body:JSON.stringify(value)});
