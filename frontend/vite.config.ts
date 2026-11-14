import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],resolve:{preserveSymlinks:true},server:{
  // 如果修改后端端口，请同步修改这里两个代理的端口。
  proxy:{'/api':'http://127.0.0.1:8787','/ws':{target:'ws://127.0.0.1:8787',ws:true}}
},build:{outDir:'dist',emptyOutDir:true}});
