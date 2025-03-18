import { Result, Space } from 'antd';

export default function NotFoundPage() {
  return (
    <div className="error-page" style={{ 
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5'
    }}>
      <Result
        status="404"
        title="404"
        style={{ maxWidth: 600 }}
        subTitle="抱歉，您访问的页面不存在"
        extra={
          <Space>
          </Space>
        }
      />
    </div>
  );
} 