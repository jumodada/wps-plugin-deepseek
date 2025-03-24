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
  }, []);
  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <Outlet />
    </ConfigProvider>
  );
}
  