import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import './index.css'
import { RouterProvider } from 'react-router-dom';
import router from './route';
import ribbon from './wpsjs'
dayjs.locale('zh-cn')

const Bootstrap = () => {
  useEffect(() => {
    // 初始化全局对象
    window.ribbon = ribbon;
    window._Application = window.Application;
    
    // 注意：页面级别的监听器应当在各个页面中使用usePageReset钩子来管理
    // 这样可以确保在组件卸载时正确移除监听器
  }, []);

  return <RouterProvider router={router} />;
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
)
