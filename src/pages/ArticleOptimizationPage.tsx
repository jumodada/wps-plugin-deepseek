import { useState, useRef } from 'react';
import { Button, Card, message, Progress, InputNumber, Slider, Switch, Row, Col, Tooltip } from 'antd';
import { QuestionCircleOutlined, SettingOutlined, StopOutlined } from '@ant-design/icons';
import { submitOptimization } from '../api/deepseek';
import { xx }    from './xx.js';

const extractTextFromXML = (xmlContent: string): string => {
    try {
        const textContent = xmlContent.replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return textContent;
    } catch (error) {
        return xmlContent;
    }
};

// 检测内容是否为XML格式
const isXMLContent = (content: string): boolean => {
    return content.trim().startsWith('<?xml') || content.trim().startsWith('<w:');
};

const splitTextIntoChunks = (text: string, chunkSize: number = 3000): string[] => {
    if (isXMLContent(text)) {
        const plainText = extractTextFromXML(text);
        return splitPlainTextIntoChunks(plainText, chunkSize);
    }
    
    return splitPlainTextIntoChunks(text, chunkSize);
};

// 将普通文本分成较小的块
const splitPlainTextIntoChunks = (text: string, chunkSize: number = 3000): string[] => {
    if (!text || text.length <= chunkSize) {
        return [text];
    }
    
    const chunks: string[] = [];
    
    // 首先尝试按段落分割
    const paragraphs = text.split(/\n\s*\n/);
    
    // 如果段落太少，尝试按句子分割
    if (paragraphs.length <= 1 && text.length > chunkSize) {
        return splitBySentences(text, chunkSize);
    }
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
        // 如果当前段落本身就超过了块大小
        if (paragraph.length > chunkSize) {
            // 如果当前块不为空，先添加当前块
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            
            // 将大段落分割成更小的部分
            const subChunks = splitBySentences(paragraph, chunkSize);
            chunks.push(...subChunks);
            continue;
        }
        
        // 如果当前段落加上已有内容超过了块大小且当前块不为空
        if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = paragraph;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
};

// 按句子分割文本
const splitBySentences = (text: string, chunkSize: number): string[] => {
    const chunks: string[] = [];
    
    // 使用正则表达式按句子分割
    // 匹配中文和英文的句子结束标志
    const sentences = text.split(/(?<=[.!?。！？\n])\s*/);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
        // 如果单个句子超过块大小，直接按字符切割
        if (sentence.length > chunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            
            // 按字符数硬分割
            for (let i = 0; i < sentence.length; i += chunkSize) {
                chunks.push(sentence.substring(i, i + chunkSize));
            }
            continue;
        }
        
        if (currentChunk.length + sentence.length > chunkSize && currentChunk) {
            chunks.push(currentChunk);
            currentChunk = sentence;
        } else {
            currentChunk += (currentChunk && !currentChunk.endsWith('\n') ? ' ' : '') + sentence;
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
};

// 带重试机制的API请求函数
const retryOptimization = async (params: any, maxRetries: number = 3): Promise<any> => {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await submitOptimization(params);
        } catch (error: any) {
            // 如果是中断错误，直接向上抛出
            if (error.name === 'AbortError' || error.name === 'CanceledError') {
                throw error;
            }
            
            lastError = error;
            // 等待一段时间再重试
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
    
    // 所有重试都失败了
    throw lastError || new Error('优化请求失败，已达到最大重试次数');
};

const ArticleOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    
    // 高级配置选项
    const [chunkSize, setChunkSize] = useState(2000); // 默认降低到2000以适应token限制
    const [temperature, setTemperature] = useState(0.7);
    const [preserveFormatting, setPreserveFormatting] = useState(true);
    const [isProcessingXML, setIsProcessingXML] = useState(false);
    
    // 用于跟踪和取消请求的引用
    const cancelTokenRef = useRef<AbortController | null>(null);
    const processingRef = useRef<boolean>(false);
    
    // 取消请求方法
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
    
    const handleOptimizeSelection = async () => {
        try {
            // 创建新的取消控制器
            cancelTokenRef.current = new AbortController();
            processingRef.current = true;
            
            setLoading(true);
            // 获取选中的文本
            const selectedContent = window._Application.Selection.Text;
            if (!selectedContent || selectedContent.trim() === '') {
                message.warning('请先选择需要优化的文本内容');
                setLoading(false);
                return;
            }
            
            setProcessingStatus('正在处理选中段落...');
            
            // 检查是否为XML内容
            const isXML = isXMLContent(selectedContent);
            setIsProcessingXML(isXML);
            
            // 如果是XML，提取文本
            const contentToProcess = isXML ? extractTextFromXML(selectedContent) : selectedContent;
            
            const formatInstruction = preserveFormatting ? '，保持原意和格式' : '，保持原意';
            
            const params = {
                messages: [{
                    role: "user",
                    content: `请对以下段落内容进行优化，提升其表达质量和专业度${formatInstruction}：\n\n${contentToProcess}`
                }],
                model: "deepseek-chat",
                temperature: temperature,
                signal: cancelTokenRef.current.signal
            };
            
            const response = await retryOptimization(params);
            
            if (processingRef.current && response.data && response.data.choices && response.data.choices.length > 0) {
                const optimizedContent = response.data.choices[0].message.content;
                window._Application.Selection.Text = optimizedContent;
                message.success('段落优化成功！');
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                // 请求被取消，不显示错误消息
                return;
            }
            message.error(typeof error === 'object' && error !== null && 'message' in error 
                ? String(error.message) 
                : '请求失败，请检查网络连接或API配置');
        } finally {
            if (processingRef.current) {
                setLoading(false);
                setProcessingStatus('');
                setIsProcessingXML(false);
                processingRef.current = false;
            }
        }
    }
    
    const handleOptimizeAll = async () => {
        try {
            // 创建新的取消控制器
            cancelTokenRef.current = new AbortController();
            processingRef.current = true;
            
            setLoading(true);
            setProgress(0);
            //const articleContent = window._Application.ActiveDocument.WordOpenXML;
            const articleContent = xx;
            
            if (!articleContent || articleContent.trim() === '') {
                message.warning('文档内容为空，无法进行优化');
                setLoading(false);
                return;
            }
            
            // 检查是否为XML内容
            const isXML = isXMLContent(articleContent);
            setIsProcessingXML(isXML);
            
            // 如果是XML，提取文本
            const contentToProcess = isXML ? extractTextFromXML(articleContent) : articleContent;
            setProcessingStatus('正在提取文档文本内容...');
            
            // 将文章分成较小的块
            const chunks = splitTextIntoChunks(contentToProcess, chunkSize);
            setProcessingStatus(`文档将分为${chunks.length}个部分进行处理...`);
            
            let optimizedContent = '';
            let failedChunks = 0;
            
            for (let i = 0; i < chunks.length; i++) {
                // 检查是否已取消
                if (!processingRef.current) break;
                
                try {
                    const chunk = chunks[i];
                    setProcessingStatus(`正在处理第${i+1}/${chunks.length}部分...`);
                    
                    const formatInstruction = preserveFormatting ? '，保持原意和格式' : '，保持原意';
                    
                    const params = {
                        messages: [{
                            role: "user",
                            content: `请对以下文章内容进行优化，提升其表达质量和专业度${formatInstruction}：\n\n${chunk}`
                        }],
                        model: "deepseek-chat",
                        temperature: temperature,
                        signal: cancelTokenRef.current?.signal
                    };
                    
                    const response = await retryOptimization(params);
                    
                    if (processingRef.current && response.data && response.data.choices && response.data.choices.length > 0) {
                        const chunkResult = response.data.choices[0].message.content;
                        optimizedContent += (i > 0 ? '\n\n' : '') + chunkResult;
                        
                        // 更新进度
                        const newProgress = Math.round(((i + 1) / chunks.length) * 100);
                        setProgress(newProgress);
                    } else if (processingRef.current) {
                        failedChunks++;
                        // 如果无法获取结果，至少保留原文
                        optimizedContent += (i > 0 ? '\n\n' : '') + chunk;
                    }
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        // 请求被取消，跳出循环
                        break;
                    }
                    
                    if (processingRef.current) {
                        failedChunks++;
                        // 出错时保留原文
                        optimizedContent += (i > 0 ? '\n\n' : '') + chunks[i];
                        console.error(`处理第${i+1}部分时出错:`, error);
                    }
                }
            }
            
            // 只有在未取消的情况下才更新文档
            if (processingRef.current) {
                // 将所有优化后的内容更新到文档
                window._Application.ActiveDocument.Content = optimizedContent;
                
                if (failedChunks > 0) {
                    message.warning(`文章部分优化成功！有${failedChunks}/${chunks.length}个部分未能成功优化。`);
                } else {
                    message.success('文章优化成功！');
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                // 请求被取消，不显示错误消息
                return;
            }
            
            message.error(typeof error === 'object' && error !== null && 'message' in error 
                ? String(error.message) 
                : '请求失败，请检查网络连接或API配置');
        } finally {
            if (processingRef.current) {
                setLoading(false);
                setProgress(0);
                setProcessingStatus('');
                setIsProcessingXML(false);
                processingRef.current = false;
            }
        }
    }

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'start', height: '100vh' }}>
            <Card title="段落优化" style={{ marginBottom: '20px' }}>
                <p>选择需要优化的段落，点击按钮即可智能优化文章表达</p>
                <Button 
                    type="primary" 
                    onClick={handleOptimizeSelection}
                    loading={loading}
                    style={{ marginRight: '10px' }}
                >
                    优化选中段落
                </Button>
                {loading && (
                    <Button 
                        danger
                        icon={<StopOutlined />}
                        onClick={handleCancel}
                    >
                        取消操作
                    </Button>
                )}
            </Card>
            <Card title="全文优化">
                <p>一键优化全文内容，提升文章整体质量</p>
                {loading && (
                    <>
                        {processingStatus && <p style={{ color: '#1890ff' }}>{processingStatus}</p>}
                        {isProcessingXML && <p style={{ color: '#ff4d4f' }}>检测到XML格式内容，正在提取纯文本...</p>}
                        {progress > 0 && (
                            <Progress percent={progress} status="active" style={{ marginBottom: '15px' }} />
                        )}
                    </>
                )}
                <Button 
                    onClick={handleOptimizeAll} 
                    type="primary"
                    loading={loading}
                    style={{ marginRight: '10px' }}
                >
                    一键优化全文
                </Button>
                {loading && (
                    <Button 
                        danger
                        icon={<StopOutlined />}
                        onClick={handleCancel}
                        style={{ marginRight: '10px' }}
                    >
                        取消操作
                    </Button>
                )}
                <Button 
                    icon={<SettingOutlined />} 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    type="text"
                >
                    高级选项
                </Button>
                
                {showAdvanced && (
                    <div style={{ marginTop: '15px', border: '1px solid #f0f0f0', padding: '15px', borderRadius: '4px' }}>
                        <Row gutter={[16, 16]}>
                            <Col span={24}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ marginRight: '8px' }}>分段大小</span>
                                    <Tooltip title="文本将被分成多个段落进行处理，每段的最大字符数">
                                        <QuestionCircleOutlined />
                                    </Tooltip>
                                </div>
                                <Row align="middle">
                                    <Col span={16}>
                                        <Slider 
                                            min={1000} 
                                            max={5000} 
                                            onChange={setChunkSize} 
                                            value={chunkSize} 
                                            step={100}
                                            disabled={loading}
                                        />
                                    </Col>
                                    <Col span={6} offset={2}>
                                        <InputNumber
                                            min={1000}
                                            max={5000}
                                            style={{ width: '100%' }}
                                            value={chunkSize}
                                            onChange={(value) => value !== null && setChunkSize(value)}
                                            disabled={loading}
                                        />
                                    </Col>
                                </Row>
                            </Col>
                            
                            <Col span={24}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ marginRight: '8px' }}>创造性程度</span>
                                    <Tooltip title="较低值更保守，较高值更有创意（0.1-1.0）">
                                        <QuestionCircleOutlined />
                                    </Tooltip>
                                </div>
                                <Row align="middle">
                                    <Col span={16}>
                                        <Slider 
                                            min={0.1} 
                                            max={1.0} 
                                            onChange={setTemperature} 
                                            value={temperature} 
                                            step={0.05}
                                            disabled={loading}
                                        />
                                    </Col>
                                    <Col span={6} offset={2}>
                                        <InputNumber
                                            min={0.1}
                                            max={1.0}
                                            style={{ width: '100%' }}
                                            value={temperature}
                                            onChange={(value) => value !== null && setTemperature(value)}
                                            step={0.05}
                                            disabled={loading}
                                        />
                                    </Col>
                                </Row>
                            </Col>
                            
                            <Col span={24}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <span style={{ marginRight: '8px' }}>保留原文格式</span>
                                        <Tooltip title="开启后，优化将尽量保持原文的段落和格式">
                                            <QuestionCircleOutlined />
                                        </Tooltip>
                                    </div>
                                    <Switch 
                                        checked={preserveFormatting} 
                                        onChange={setPreserveFormatting}
                                        disabled={loading}
                                    />
                                </div>
                            </Col>
                        </Row>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ArticleOptimizationPage; 