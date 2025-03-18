import { useRouteError } from 'react-router-dom';
import NotFoundPage from '../pages/NotFound';
import ServerErrorPage from '../pages/ServerError';

export default function ErrorHandler() {
  const error = useRouteError() as any;
  
  // 根据状态码选择错误页面
  if (error?.status === 404) {
    return <NotFoundPage />;
  }
  
  // 处理502或其他服务器错误
  if (error?.status === 502 || error?.status?.toString().startsWith('5')) {
    return <ServerErrorPage />;
  }

  // 默认返回服务器错误页面
  return <ServerErrorPage />;
} 