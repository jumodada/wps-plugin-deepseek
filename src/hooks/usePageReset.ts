import { useCallback } from 'react';
import useDocumentActivateListener from './useDocumentActivateListener';

/**
 * 封装了文档激活事件监听和页面重置功能的Hook
 * 当文档切换时，将触发页面刷新或状态重置
 * 
 * @param resetCallback 可选的重置回调，用于执行自定义重置逻辑
 */
const usePageReset = (resetCallback?: () => void) => {
  // 处理文档激活事件的回调
  const handleDocumentActivate = useCallback((doc: any) => {
    console.log('文档已切换，准备重置页面状态');
    
    // 如果提供了自定义重置回调，则执行它
    if (resetCallback) {
      resetCallback();
    } else {
      // 默认行为：刷新页面
      window.location.reload();
    }
  }, [resetCallback]);

  // 使用文档激活事件监听器
  useDocumentActivateListener(handleDocumentActivate);
};

export default usePageReset; 