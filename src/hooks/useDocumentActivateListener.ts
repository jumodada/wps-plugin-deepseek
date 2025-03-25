import { useEffect, useRef } from 'react';

/**
 * 自定义Hook，用于监听Word文档的激活事件
 * 当用户切换到不同文档时触发回调
 * 组件卸载时自动移除监听器
 * 
 * @param callback 文档激活时的回调函数
 */
const useDocumentActivateListener = (callback: (doc: any) => void) => {
  // 使用ref来存储回调函数，避免依赖变化导致频繁添加/移除监听器
  const callbackRef = useRef<(doc: any) => void>(callback);
  
  // 更新ref中的回调函数值
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // 为了捕获事件而保存的函数引用
    const eventHandler = (doc: any) => {
      callbackRef.current(doc);
    };
    
    // 添加事件监听器
    if (window._Application && window._Application.ApiEvent) {
      window._Application.ApiEvent.AddApiEventListener("WindowActivate", eventHandler);
      
      console.log('文档激活事件监听器已添加');
    }
    
    // 在组件卸载时移除事件监听器
    return () => {
      if (window._Application && window._Application.ApiEvent) {
        window._Application.ApiEvent.RemoveApiEventListener("WindowActivate", eventHandler);
        
        console.log('文档激活事件监听器已移除');
      }
    };
  }, []); // 空依赖数组确保只添加/移除一次监听器
};

export default useDocumentActivateListener; 