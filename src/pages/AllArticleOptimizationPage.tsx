import { useState, useEffect } from 'react';
import { Button, Spin, message } from 'antd';
import { usePageReset } from '../hooks';
import mammoth from 'mammoth';
import {xx} from './xx';
const AllArticleOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    const [htmlContent, setHtmlContent] = useState('');
    
    const handleReset = () => {
        setLoading(false);
        setHtmlContent('');
    };
    
    usePageReset(handleReset);
    
    const getDocumentContent = async () => {
            setLoading(true);
            // if (!window._Application?.ActiveDocument) {
            //     message.warning('请先打开一个Word文档');
            //     setLoading(false);
            //     return;
            // }
            
            alert(window._Application?.ActiveDocument?.GridOriginVertical);
            
            // 获取Word文档的OpenXML内容
            const openXml = xx;
            if (!openXml) {
                message.error('无法获取文档的OpenXML内容');
                setLoading(false);
                return;
            }
            // 将OpenXML字符串转换为ArrayBuffer
            const encoder = new TextEncoder();
            const xmlBytes = encoder.encode(openXml);
            // 使用mammoth.js将OpenXML转换为HTML
            const result = await mammoth.convertToHtml({ arrayBuffer: xmlBytes.buffer });
            if (result && result.value) {
                setHtmlContent(result.value);
            } else {
                message.error('文档转换失败');
            }
            
            setLoading(false);
    };
    
    useEffect(() => {
        getDocumentContent();
    }, []);
    
    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
                <h1>文档预览</h1>
                <Button 
                    type="primary" 
                    onClick={getDocumentContent}
                    loading={loading}
                >
                    刷新文档
                </Button>
            </div>
            
            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <Spin size="large" />
                    <p style={{ marginTop: '20px' }}>正在处理文档内容...</p>
                </div>
            ) : (
                <div>
                    {htmlContent ? (
                        <div 
                            className="document-preview"
                            style={{ 
                                border: '1px solid #e8e8e8', 
                                borderRadius: '4px',
                                padding: '20px',
                                backgroundColor: '#fff',
                                minHeight: '300px',
                                maxHeight: '600px',
                                overflow: 'auto'
                            }}
                            dangerouslySetInnerHTML={{ __html: htmlContent }} 
                        />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '50px', backgroundColor: '#f9f9f9' }}>
                            <p>未能获取文档内容或文档为空</p>
                            <Button 
                                type="primary" 
                                onClick={getDocumentContent}
                                style={{ marginTop: '20px' }}
                            >
                                重试
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AllArticleOptimizationPage; 