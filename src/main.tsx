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
    window.ribbon = ribbon;
    window._Application = window.Application;
  }, []);

  return <RouterProvider router={router} />;
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
)
