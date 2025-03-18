import { useState } from 'react';
import { Button, Card, message } from 'antd';
import { submitOptimization } from '../api/deepseek';

const ArticleOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    
    const handleOptimizeAll = async () => {
        try {
            setLoading(true);
            const articleContent = window._Application.ActiveDocument.WordOpenXML;
            
            // 构造符合DeepSeek API要求的请求参数
            const params = {
                messages: [{
                    role: "user",
                    content: `请润色以下文章，保持原有格式和结构，只返回优化后的内容,用同样的xml格式：\n\n${articleContent}`
                }],
                model: "deepseek-chat",
                temperature: 0.7
            };

            const response: any = await submitOptimization(params as  any);
            
            if (response.data.status === 'completed') {
                // 将优化后的内容写回Word文档
                window._Application.ActiveDocument.Content = response.data.result;
                message.success('文章优化成功！');
            } else {
                message.error(response.data.error || '优化处理失败');
            }
        } catch (error) {
            message.error('请求失败，请检查网络连接或API配置');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'start', height: '100vh' }}>
            <Card title="段落优化" style={{ marginBottom: '20px' }}>
                <p>选择需要优化的段落，点击按钮即可智能优化文章表达</p>
                <Button 
                    type="primary" 
                    onClick={handleOptimizeAll}
                    loading={loading}
                >
                    优化选中段落
                </Button>
            </Card>
            <Card title="全文优化">
                <p>一键优化全文内容，提升文章整体质量</p>
                <Button 
                    onClick={handleOptimizeAll} 
                    type="primary"
                    loading={loading}
                >
                    一键优化全文
                </Button>
            </Card>
        </div>
    );
};

export default ArticleOptimizationPage; 