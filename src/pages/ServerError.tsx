import { Result, Space } from 'antd';

export default function ServerErrorPage() {
  return (
    <div className="error-page" style={{ 
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5'
    }}>
      <Result
        status="500"
        title="502"
        style={{ maxWidth: 600 }}
        subTitle="服务器暂时不可用，请稍后再试"
        extra={
          <Space>
          </Space>
        }
      />
    </div>
  );
} 