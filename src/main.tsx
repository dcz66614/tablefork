// P029 TableFork — 双表同文交互工作台入口（P029-T009）。
// 替换 T001 占位挂载：渲染 src/ui/App，并引入 src/ui/styles.css。
// 本地离线应用：不请求远程字体/样式/脚本。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
