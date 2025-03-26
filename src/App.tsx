import { ConfigProvider } from 'antd';
import { Outlet } from 'react-router-dom';
import './App.css';
import zhCN from "antd/es/locale/zh_CN";
import ribbon from './wpsjs'
import { useEffect } from 'react';
import theme from './theme';
export default function App() {
  useEffect(() => {
    window.ribbon = ribbon;
    window._Application = window.Application;
  }, []);
  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <div style={{ width: '100vw', height: '100%', backgroundColor: '#f0f2f5'  }}>
        <Outlet />
      </div>
    </ConfigProvider>
  );
}
