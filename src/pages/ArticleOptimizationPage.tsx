import { useState } from 'react';
import { Button, Card, message, Progress, Collapse, InputNumber, Slider, Switch, Row, Col, Tooltip } from 'antd';
import { QuestionCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { submitOptimization } from '../api/deepseek';
import { xx } from './xx'

const { Panel } = Collapse;

// 将文本分成较小的段落，每段大约包含指定字符数
const splitTextIntoChunks = (text: string, chunkSize: number = 3000): string[] => {
    if (!text || text.length <= chunkSize) {
        return [text];
    }
    
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/); // 按段落分割
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
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

// 带重试机制的API请求函数
const retryOptimization = async (params: any, maxRetries: number = 3): Promise<any> => {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await submitOptimization(params);
        } catch (error) {
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
    const [chunkSize, setChunkSize] = useState(3000);
    const [temperature, setTemperature] = useState(0.7);
    const [preserveFormatting, setPreserveFormatting] = useState(true);
    
    const handleOptimizeSelection = async () => {
        try {
            setLoading(true);
            // 获取选中的文本
            const selectedContent = window._Application.Selection.Text;
            if (!selectedContent || selectedContent.trim() === '') {
                message.warning('请先选择需要优化的文本内容');
                setLoading(false);
                return;
            }
            
            setProcessingStatus('正在处理选中段落...');
            
            const formatInstruction = preserveFormatting ? '，保持原意和格式' : '，保持原意';
            
            const params = {
                messages: [{
                    role: "user",
                    content: `请对以下段落内容进行优化，提升其表达质量和专业度${formatInstruction}：\n\n${selectedContent}`
                }],
                model: "deepseek-chat",
                temperature: temperature
            };
            
            const response = await retryOptimization(params);
            
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const optimizedContent = response.data.choices[0].message.content;
                window._Application.Selection.Text = optimizedContent;
                message.success('段落优化成功！');
            } else {
                message.error('优化处理失败，未获取到有效结果');
            }
        } catch (error) {
            message.error(typeof error === 'object' && error !== null && 'message' in error 
                ? String(error.message) 
                : '请求失败，请检查网络连接或API配置');
        } finally {
            setLoading(false);
            setProcessingStatus('');
        }
    }
    
    const handleOptimizeAll = async () => {
        try {
            setLoading(true);
            setProgress(0);
            // const articleContent = window._Application.ActiveDocument.WordOpenXML;
            const articleContent = xx;
            
            if (!articleContent || articleContent.trim() === '') {
                message.warning('文档内容为空，无法进行优化');
                setLoading(false);
                return;
            }
            
            // 将文章分成较小的块
            const chunks = splitTextIntoChunks(articleContent, chunkSize);
            setProcessingStatus(`文档将分为${chunks.length}个部分进行处理...`);
            
            let optimizedContent = '';
            let failedChunks = 0;
            
            for (let i = 0; i < chunks.length; i++) {
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
                        temperature: temperature
                    };
                    
                    const response = await retryOptimization(params);
                    
                    if (response.data && response.data.choices && response.data.choices.length > 0) {
                        const chunkResult = response.data.choices[0].message.content;
                        optimizedContent += (i > 0 ? '\n\n' : '') + chunkResult;
                        
                        // 更新进度
                        const newProgress = Math.round(((i + 1) / chunks.length) * 100);
                        setProgress(newProgress);
                    } else {
                        failedChunks++;
                        // 如果无法获取结果，至少保留原文
                        optimizedContent += (i > 0 ? '\n\n' : '') + chunk;
                    }
                } catch (error) {
                    failedChunks++;
                    // 出错时保留原文
                    optimizedContent += (i > 0 ? '\n\n' : '') + chunks[i];
                    console.error(`处理第${i+1}部分时出错:`, error);
                }
            }
            
            // 将所有优化后的内容更新到文档
            window._Application.ActiveDocument.Content = optimizedContent;
            
            if (failedChunks > 0) {
                message.warning(`文章部分优化成功！有${failedChunks}/${chunks.length}个部分未能成功优化。`);
            } else {
                message.success('文章优化成功！');
            }
        } catch (error) {
            message.error(typeof error === 'object' && error !== null && 'message' in error 
                ? String(error.message) 
                : '请求失败，请检查网络连接或API配置');
        } finally {
            setLoading(false);
            setProgress(0);
            setProcessingStatus('');
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
                >
                    优化选中段落
                </Button>
            </Card>
            <Card title="全文优化">
                <p>一键优化全文内容，提升文章整体质量</p>
                {loading && (
                    <>
                        {processingStatus && <p style={{ color: '#1890ff' }}>{processingStatus}</p>}
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