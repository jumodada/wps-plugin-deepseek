import React from 'react';
import { createRoot } from 'react-dom/client'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import './index.css'
import { RouterProvider } from 'react-router-dom';
import router from './route';

dayjs.locale('zh-cn')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
