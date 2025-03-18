import type { ThemeConfig } from 'antd';

const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 4,
    colorBgContainer: '#ffffff',
  },
  components: {
    Layout: {
      colorBgHeader: '#f5f5f5',
    },
    Spin: {
      colorPrimary: '#1890ff'
    }
  }
};

export default theme; 