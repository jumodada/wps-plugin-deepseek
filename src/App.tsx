import { ConfigProvider } from 'antd';
import { Outlet } from 'react-router-dom';
import './App.css';
import zhCN from "antd/es/locale/zh_CN";

export default function App() {
  return (
    <ConfigProvider  locale={zhCN}>
      <Outlet />
    </ConfigProvider>
  );
}
