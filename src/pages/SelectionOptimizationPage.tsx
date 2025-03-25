import { useState, useRef, useEffect } from 'react';
import { Button, message, Progress, Card, Space, Tooltip } from 'antd';
import { StopOutlined, SyncOutlined, AimOutlined } from '@ant-design/icons';
import { 
    isWordDocument,
    extractSelectedText,
    retryOptimization,
    locateParagraphInDocument,
    injectOptimizationStyles
} from '../tool/optimization';
import { usePageReset } from '../hooks';

const SelectionOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState('');
    const [originalItem, setOriginalItem] = useState<{ id: string, text: string } | null>(null);
    const [optimizedItem, setOptimizedItem] = useState<{ id: string, text: string } | null>(null);
    const [showResults, setShowResults] = useState(false);
    const [isActive, setIsActive] = useState(false);
    
    // 使用文档切换监听钩子，当文档切换时重置页面状态
    const handleReset = () => {
        // 自定义重置逻辑
        setLoading(false);
        setProgress(0);
        setProcessingStatus('');
        setOriginalItem(null);
        setOptimizedItem(null);
        setShowResults(false);
        setIsActive(false);
        
        // 恢复样式
        restoreOriginalStyle();
        
        message.info('文档已切换，页面已重置');
    };
    
    // 应用页面重置钩子
    usePageReset(handleReset);
    
    const cardRef = useRef<HTMLDivElement | null>(null);
    const originalFontStyles = useRef<{ underline: number, color: number } | null>(null);
    
    useEffect(() => {
        injectOptimizationStyles();
    }, []);
    
    // 在卸载组件或取消激活状态时恢复原始样式
    useEffect(() => {
        return () => {
            // 组件卸载时恢复样式
            restoreOriginalStyle();
        };
    }, []);
    
    const cancelTokenRef = useRef<AbortController | null>(null);
    const processingRef = useRef<boolean>(false);
    
    // 恢复原始文本样式的函数
    const restoreOriginalStyle = () => {
        if (originalFontStyles.current && isActive) {
            try {
                const selection = window._Application.Selection;
                if (selection) {
                    selection.Font.Underline = originalFontStyles.current.underline;
                    selection.Font.Color = originalFontStyles.current.color;
                }
            } catch (error) {
                console.error('恢复原始样式时出错:', error);
            }
        }
    };
    
    const handleCancel = () => {
        if (cancelTokenRef.current) {
            cancelTokenRef.current.abort();
            cancelTokenRef.current = null;
        }
        processingRef.current = false;
        message.info('操作已取消');
        setLoading(false);
        setProcessingStatus('');
        setProgress(0);
    };
    
    const handleStartProcess = async () => {
        try {
            // 设置取消控制器
            cancelTokenRef.current = new AbortController();
            processingRef.current = true;
            
            setLoading(true);
            setProgress(0);
            
            if (!isWordDocument()) {
                message.warning('无法访问Word文档，请确保文档已打开');
                setLoading(false);
                return;
            }
            
            setProcessingStatus('正在提取选中内容...');
            const selectedText = extractSelectedText();
            
            if (!selectedText) {
                message.warning('无法获取选中内容，请确保已选中文本');
                setLoading(false);
                return;
            }
            
            setOriginalItem(selectedText);
            setProgress(25);
            
            try {
                setProcessingStatus('正在优化内容...');
                
                const params = {
                    messages: [
                        {
                            role: "system",
                            content: "你是一个专业的文章优化助手，能够提升文本的表达质量和专业度，保持原意和格式。"
                        },
                        {
                            role: "user",
                            content: `请对以下段落内容进行优化，保持原意和格式：\n\n${selectedText.text}`
                        }
                    ],
                    model: "deepseek-chat",
                    signal: cancelTokenRef.current?.signal
                };
                
                setProgress(50);
                
                // 发送请求
                const response = await retryOptimization(params);
                
                setProgress(75);
                
                if (processingRef.current && response.data && response.data.choices && response.data.choices.length > 0) {
                    const result = response.data.choices[0].message.content;
                    
                    setOptimizedItem({
                        id: selectedText.id,
                        text: result.trim()
                    });
                    
                    setProgress(100);
                    setShowResults(true);
                    message.success('内容优化完成！');
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    return;
                }
                
                message.error(typeof error === 'object' && error !== null && 'message' in error 
                    ? String(error.message) 
                    : '请求失败，请检查网络连接或API配置');
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                message.error(typeof error === 'object' && error !== null && 'message' in error 
                    ? String(error.message) 
                    : '处理失败，请重试');
            }
        } finally {
            if (processingRef.current) {
                setLoading(false);
                setProgress(0);
                setProcessingStatus('');
                processingRef.current = false;
            }
        }
    };
    
    const handleReplace = () => {
        // 替换前恢复原始样式
        restoreOriginalStyle();
        setIsActive(false);
        
        try {
            if (optimizedItem && originalItem) {
                window._Application.Selection.Text = optimizedItem.text;
                
                if (cardRef.current) {
                    cardRef.current.style.animation = 'fadeOut 0.5s ease forwards';
                    
                    setTimeout(() => {
                        setShowResults(false);
                    }, 500);
                } else {
                    setShowResults(false);
                }
            } else {
                message.warning('没有可替换的内容');
            }
        } catch (error: any) {
            message.error('替换失败: ' + (error.message || String(error)));
        }
    };
    
    const handleLocateInDocument = () => {
        if (originalItem) {
            try {
                // 如果当前卡片处于激活状态，则取消激活并恢复样式
                if (isActive) {
                    restoreOriginalStyle();
                    setIsActive(false);
                    return;
                }
                
                // 定位到文档中的段落
                const found = locateParagraphInDocument(originalItem.id);
                
                if (found) {
                    // 保存原始样式
                    const selection = window._Application.Selection;
                    originalFontStyles.current = {
                        underline: selection.Font.Underline,
                        color: selection.Font.Color
                    };
                    
                    // 设置新样式
                    selection.Font.Underline = 11; // 设置下划线
                    selection.Font.Color = 255;   // 设置颜色为红色
                    
                    setIsActive(true);
                }
            } catch (error: any) {
                message.error('定位失败: ' + (error.message || String(error)));
            }
        }
    };
    
    const renderComparisonCard = () => {
        if (!showResults || !originalItem || !optimizedItem) return null;
        
        if (originalItem.text.trim() === optimizedItem.text.trim()) {
            return (
                <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                    <Card style={{ maxWidth: '500px', margin: '0 auto' }}>
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <p>优化内容与原内容相同，无需替换</p>
                            <Button 
                                size="large" 
                                onClick={() => {
                                    restoreOriginalStyle();
                                    setIsActive(false);
                                    setShowResults(false);
                                }}
                                style={{ marginTop: '15px' }}
                            >
                                返回
                            </Button>
                        </div>
                    </Card>
                </div>
            );
        }
        
        // 定义卡片宽度
        const cardWidth = 500;
        
        return (
            <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                <h2 style={{ color: 'white', textAlign: 'center', marginBottom: '20px' }}>优化结果对比</h2>
                <Card 
                    ref={cardRef}
                    bordered={true}
                    style={{ 
                        width: cardWidth,
                        margin: '0 auto',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        boxShadow: isActive ? '0 0 10px rgba(24, 144, 255, 0.8)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
                        borderWidth: isActive ? '2px' : '1px',
                        borderColor: isActive ? '#1890ff' : '',
                        animation: 'fadeInUp 0.5s ease'
                    }}
                    bodyStyle={{
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        background: isActive ? '#f0f8ff' : ''
                    }}
                    hoverable
                    onClick={handleLocateInDocument}
                >
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '12px' 
                        }}>
                            <h4 style={{ margin: 0 }}>原始内容:</h4>
                            <Tooltip title="定位到文档">
                                <AimOutlined style={{ color: isActive ? '#1890ff' : '#52c41a' }} />
                            </Tooltip>
                        </div>
                        <Tooltip title={originalItem.text} placement="topLeft" color="#fff" overlayInnerStyle={{ color: '#333' }}>
                            <div style={{ 
                                maxHeight: '150px', 
                                overflow: 'auto',
                                marginBottom: '16px',
                                padding: '12px',
                                background: '#f9f9f9',
                                borderRadius: '4px'
                            }}>
                                {originalItem.text}
                            </div>
                        </Tooltip>
                        
                        <h4>优化后内容:</h4>
                        <Tooltip title={optimizedItem.text} placement="topLeft" color="#fff" overlayInnerStyle={{ color: '#333' }}>
                            <div style={{ 
                                maxHeight: '150px', 
                                overflow: 'auto',
                                color: '#1890ff', 
                                padding: '12px',
                                background: '#f0f8ff',
                                borderRadius: '4px',
                                marginBottom: '16px'
                            }}>
                                {optimizedItem.text}
                            </div>
                        </Tooltip>
                        
                        <div style={{ textAlign: 'center', marginTop: 'auto' }}>
                            <Space>
                                <Button 
                                    type="primary" 
                                    icon={<SyncOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleReplace();
                                    }}
                                >
                                    替换内容
                                </Button>
                                <Button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        restoreOriginalStyle();
                                        setIsActive(false);
                                        setShowResults(false);
                                    }}
                                >
                                    取消
                                </Button>
                            </Space>
                        </div>
                    </div>
                </Card>
            </div>
        );
    };

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'white' }}>
            {loading ? (
                <div style={{ width: '80%', maxWidth: '500px', textAlign: 'center', color: 'white' }}>
                    {processingStatus && <p style={{ marginBottom: '20px', color: 'white' }}>{processingStatus}</p>}
                    <Progress 
                        type="circle"
                        percent={progress} 
                        status="active" 
                        style={{ marginBottom: '20px' }} 
                        strokeColor={{
                            '0%': '#108ee9',
                            '100%': '#87d068',
                        }}
                        trailColor="rgba(255,255,255,0.2)"
                        format={percent => <span style={{ color: 'white' }}>{percent}%</span>}
                    />
                    <Button 
                        danger
                        icon={<StopOutlined />}
                        onClick={handleCancel}
                        style={{ marginTop: '20px' }}
                    >
                        取消操作
                    </Button>
                </div>
            ) : showResults ? (
                renderComparisonCard()
            ) : (
                <Button 
                    type="primary" 
                    onClick={handleStartProcess}
                    size="large"
                >
                    开始优化段落
                </Button>
            )}
        </div>
    );
};

export default SelectionOptimizationPage; 