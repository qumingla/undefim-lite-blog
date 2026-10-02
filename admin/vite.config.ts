import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
export default defineConfig({root:path.resolve('admin'),base:'/admin/',plugins:[react()],build:{outDir:path.resolve('dist/admin'),emptyOutDir:true},server:{port:4323,proxy:{'/api':'http://127.0.0.1:4322','/upload':'http://127.0.0.1:4322','/assets':'http://127.0.0.1:4322'}}});
