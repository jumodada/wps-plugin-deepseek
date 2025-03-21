import { useState, useRef } from 'react';
import { Button, message, Progress, Card, Row, Col, Space, Tooltip } from 'antd';
import { StopOutlined, SyncOutlined, AimOutlined } from '@ant-design/icons';
import { submitOptimization } from '../api/deepseek';

const extractParagraphsFromDocument = (): { id: string, text: string }[] => {
    try {
        const result: { id: string, text: string }[] = [];
        
        // 获取文档的OpenXML
        const docXml = window._Application.ActiveDocument.WordOpenXML;
        
        // 查找w:body标签内容
        const bodyMatch = /<w:body[^>]*>([\s\S]*?)<\/w:body>/i.exec(docXml);
        
        if (!bodyMatch || !bodyMatch[1]) {
            console.error('无法在XML中找到w:body标签');
            return [];
        }
        
        const bodyContent = bodyMatch[1];
        
        // 使用正则表达式查找所有段落
        const paragraphRegex = /<w:p\s+(?:[^>]*\s+)?w14:paraId="([^"]+)"[^>]*>([\s\S]*?)<\/w:p>/g;
        
        let match: RegExpExecArray | null;
        while ((match = paragraphRegex.exec(bodyContent)) !== null) {
            const paraId = match[1];
            const paragraphContent = match[2];
            
            // 提取段落中的文本内容
            const textContent: string[] = [];
            const textRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
            let textMatch: RegExpExecArray | null;
            
            while ((textMatch = textRegex.exec(paragraphContent)) !== null) {
                if (textMatch[1]) {
                    textContent.push(textMatch[1]);
                }
            }
            
            const paragraphText = textContent.join('').trim();
            
            // 只添加有文本内容的段落
            if (paragraphText) {
                result.push({
                    id: paraId,
                    text: paragraphText
                });
            }
        }
        
        return result;
    } catch (error) {
        console.error('获取文档段落时出错:', error);
        return []; 
    }
};


const structuredDataToText = (data: { id: string, text: string }[]): string => {
    return data.map(item => item.text).join('\n\n');
};


const isWordDocument = (): boolean => {
    try {
        return !!window._Application.ActiveDocument;
    } catch (error) {
        return false;
    }
};


const splitPlainTextIntoChunks = (text: string, chunkSize: number = 3000): string[] => {
    if (!text || text.length <= chunkSize) {
        return [text];
    }
    
    const chunks: string[] = [];
    
    
    const paragraphs = text.split(/\n\s*\n/);
    
    
    if (paragraphs.length <= 1 && text.length > chunkSize) {
        return splitBySentences(text, chunkSize);
    }
    
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
        
        if (paragraph.length > chunkSize) {
            
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            
            
            const subChunks = splitBySentences(paragraph, chunkSize);
            chunks.push(...subChunks);
            continue;
        }
        
        
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


const splitBySentences = (text: string, chunkSize: number): string[] => {
    const chunks: string[] = [];
    
    
    
    const sentences = text.split(/(?<=[.!?。！？\n])\s*/);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
        
        if (sentence.length > chunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            
            
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


const retryOptimization = async (params: any, maxRetries: number = 3): Promise<any> => {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await submitOptimization(params);
        } catch (error: any) {
            
            if (error.name === 'AbortError' || error.name === 'CanceledError') {
                throw error;
            }
            
            lastError = error;
            
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
    
    
    throw lastError || new Error('优化请求失败，已达到最大重试次数');
};


const updateXMLWithStructuredData = (originalXML: string, structuredData: { id: string, text: string }[]): string => {
    try {
        let updatedXML = originalXML;
        
        
        const paragraphMap = new Map<string, string>();
        structuredData.forEach(item => {
            paragraphMap.set(item.id, item.text);
        });
        
        
        paragraphMap.forEach((newText, paraId) => {
            
            const paragraphRegex = new RegExp(`(<w:p\\s+(?:[^>]*\\s+)?w14:paraId="${paraId}"[^>]*>)([\\s\\S]*?)(<\\/w:p>)`, 'g');
            
            updatedXML = updatedXML.replace(paragraphRegex, (match, startTag, content, endTag) => {
                
                const textTags = content.match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
                
                if (textTags.length === 0) {
                    
                    return match;
                }
                
                
                if (textTags.length === 1) {
                    const updatedContent = content.replace(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g, 
                        (textMatch, textContent) => textMatch.replace(textContent, newText));
                    return startTag + updatedContent + endTag;
                }
                
                
                
                let isFirstTag = true;
                const updatedContent = content.replace(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g, 
                    (textMatch, textContent) => {
                        if (isFirstTag) {
                            isFirstTag = false;
                            return textMatch.replace(textContent, newText);
                        }
                        return textMatch.replace(textContent, '');
                    });
                
                return startTag + updatedContent + endTag;
            });
        });
        
        return updatedXML;
    } catch (error) {
        console.error('更新XML文档时出错:', error);
        return originalXML; 
    }
};

const ArticleOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState('');
    const [originalData, setOriginalData] = useState<{ id: string, text: string }[]>([]);
    const [optimizedData, setOptimizedData] = useState<{ id: string, text: string }[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [replacedItems, setReplacedItems] = useState<Set<string>>(new Set());
    
    const chunkSize = 2000; 
    const preserveFormatting = true; 
    
    
    const cancelTokenRef = useRef<AbortController | null>(null);
    const processingRef = useRef<boolean>(false);
    
    
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
            
            cancelTokenRef.current = new AbortController();
            processingRef.current = true;
            
            setLoading(true);
            setProgress(0);
            
            if (!isWordDocument()) {
                message.warning('无法访问Word文档，请确保文档已打开');
                setLoading(false);
                return;
            }
            
            setProcessingStatus('正在提取文档段落内容...');
            const structuredData = extractParagraphsFromDocument();
            const contentToProcess = structuredDataToText(structuredData);
            
            if (structuredData.length === 0) {
                message.warning('无法从文档中提取有效内容');
                setLoading(false);
                return;
            }
            
            setOriginalData(structuredData);
            
            const chunks = splitPlainTextIntoChunks(contentToProcess, chunkSize);
            setProcessingStatus(`文档将分为${chunks.length}个部分进行处理...`);
            
            let optimizedContent = '';
            let optimizedStructuredData: { id: string, text: string }[] = [];
            let failedChunks = 0;
            
            for (let i = 0; i < chunks.length; i++) {
                
                if (!processingRef.current) break;
                
                try {
                    const chunk = chunks[i];
                    setProcessingStatus(`正在处理第${i+1}/${chunks.length}部分...`);
                    
                    const formatInstruction = preserveFormatting ? '，保持原意和格式' : '，保持原意';
                    
                    const currentChunkData = structuredData.filter(item => chunk.includes(item.text));
                    
                    const structuredInputJSON = JSON.stringify(currentChunkData);
                    
                    const params = {
                        messages: [
                            {
                                role: "system",
                                content: `你是一个专业的文章优化助手，能够提升文章的表达质量和专业度${formatInstruction}。`
                            },
                            {
                                role: "user",
                                content: `请对以下JSON格式的文章内容进行优化，返回优化后的JSON格式内容：`
                            },
                            {
                                role: "user",
                                content: structuredInputJSON
                            }
                        ],
                        model: "deepseek-chat",
                        signal: cancelTokenRef.current?.signal
                    };
                    
                    const response = await retryOptimization(params);
                    
                    console.log('DeepSeek响应结构:', JSON.stringify(response.data));
                    
                    if (processingRef.current && response.data && response.data.choices && response.data.choices.length > 0) {
                        const chunkResult = response.data.choices[0].message.content;
                        
                        try {
                            const jsonMatch = chunkResult.match(/(\[.*\])/s);
                            const jsonStr = jsonMatch ? jsonMatch[1] : chunkResult;
                            
                            const resultData = JSON.parse(jsonStr);
                            
                            if (Array.isArray(resultData)) {
                                resultData.forEach(item => {
                                    if (item.id && item.text) {
                                        optimizedStructuredData.push({ 
                                            id: item.id, 
                                            text: item.text 
                                        });
                                        optimizedContent += (optimizedContent ? '\n\n' : '') + item.text;
                                    }
                                });
                            }
                        } catch (parseError) {
                            console.error('解析返回的JSON数据失败:', parseError);
                            console.log('原始返回内容:', chunkResult);
                            
                            const resultBlocks = chunkResult.split(/\n\s*\n/);
                            for (const block of resultBlocks) {
                                const idMatch = block.match(/ID:\s*([^\n]+)/);
                                const contentMatch = block.match(/内容:\s*([\s\S]+)$/);
                                
                                if (idMatch && contentMatch) {
                                    const id = idMatch[1].trim();
                                    const optimizedText = contentMatch[1].trim();
                                    
                                    optimizedStructuredData.push({ id, text: optimizedText });
                                    optimizedContent += (optimizedContent ? '\n\n' : '') + optimizedText;
                                }
                            }
                        }
                        
                        const newProgress = Math.round(((i + 1) / chunks.length) * 100);
                        setProgress(newProgress);
                    } else if (processingRef.current) {
                        failedChunks++;
                        
                        currentChunkData.forEach(item => {
                            optimizedStructuredData.push(item);
                            optimizedContent += (optimizedContent ? '\n\n' : '') + item.text;
                        });
                    }
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        break;
                    }
                    
                    if (processingRef.current) {
                        failedChunks++;
                        
                        const currentChunkData = structuredData.filter(item => chunks[i].includes(item.text));
                        
                        currentChunkData.forEach(item => {
                            optimizedStructuredData.push(item);
                            optimizedContent += (optimizedContent ? '\n\n' : '') + item.text;
                        });
                        
                        console.error(`处理第${i+1}部分时出错:`, error);
                    }
                }
            }
            
            setOptimizedData(optimizedStructuredData);
            
            if (processingRef.current) {
                setShowResults(true);
                
                message.success('处理完成！请查看优化结果并选择是否替换。');
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                
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
                processingRef.current = false;
            }
        }
    };
    
    const handleReplace = () => {
        try {
            if (optimizedData.length > 0) {
                for (const item of optimizedData) {
                    try {
                        const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
                        for (let i = 1; i <= paragraphCount; i++) {
                            const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                            try {
                                // 查找原始文本对应的段落
                                const originalItem = originalData.find(orig => orig.id === item.id);
                                if (originalItem && paragraph.Range.Text.trim() === originalItem.text.trim()) {
                                    paragraph.Range.Text = item.text;
                                    break;
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    } catch (paraError) {
                        console.error(`替换段落 ${item.id} 时出错:`, paraError);
                    }
                }
                
                // 更新所有段落为已替换状态
                const newReplacedItems = new Set<string>();
                optimizedData.forEach(item => {
                    newReplacedItems.add(item.id);
                });
                setReplacedItems(newReplacedItems);
                
                message.success('全部内容已替换完成！');
            } else {
                message.warning('没有可替换的内容');
            }
        } catch (error: any) {
            message.error('替换失败: ' + (error.message || String(error)));
        }
    };

    const handleReplaceItem = (originalItem: { id: string, text: string }, optimizedItem: { id: string, text: string }) => {
        try {
            const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
            let replaced = false;
            
            for (let i = 1; i <= paragraphCount; i++) {
                const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                try {
                    if (paragraph.Range.Text.trim() === originalItem.text.trim()) {
                        paragraph.Range.Text = optimizedItem.text;
                        replaced = true;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (replaced) {
                const newOptimizedData = [...optimizedData];
                const itemIndex = newOptimizedData.findIndex(item => item.id === optimizedItem.id);
                if (itemIndex !== -1) {
                    newOptimizedData[itemIndex] = optimizedItem;
                    setOptimizedData(newOptimizedData);
                }
                
                setReplacedItems(prev => {
                    const newSet = new Set(prev);
                    newSet.add(optimizedItem.id);
                    return newSet;
                });
                
                message.success(`已替换内容`);
            } else {
                message.warning(`未找到原文内容相符的段落`);
            }
        } catch (error: any) {
            message.error('替换失败: ' + (error.message || String(error)));
        }
    };

    const handleUndoReplace = (originalItem: { id: string, text: string }) => {
        try {
            const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
            let replaced = false;
            
            // 在已优化数据中找到对应原始段落的优化内容
            const optimizedItem = optimizedData.find(item => item.id === originalItem.id);
            
            if (!optimizedItem) {
                message.warning('找不到对应的优化内容');
                return;
            }
            
            for (let i = 1; i <= paragraphCount; i++) {
                const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                try {
                    if (paragraph.Range.Text.trim() === optimizedItem.text.trim()) {
                        paragraph.Range.Text = originalItem.text;
                        replaced = true;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (replaced) {
                setReplacedItems(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(originalItem.id);
                    return newSet;
                });
                
                message.success(`已撤回内容替换`);
            } else {
                message.warning(`未找到优化内容相符的段落`);
            }
        } catch (error: any) {
            message.error('撤回失败: ' + (error.message || String(error)));
        }
    };

    const handleLocateInDocument = (paragraphId: string, paragraphText: string) => {
        try {
            const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
            let found = false;
            
            for (let i = 1; i <= paragraphCount; i++) {
                const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                try {
                    // 使用text内容进行比对
                    if (paragraph.Range.Text.trim() === paragraphText.trim()) {
                        paragraph.Range.Select();
                        found = true;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (!found) {
                message.warning('未找到对应内容的段落');
            }
        } catch (error: any) {
            message.error('定位失败: ' + (error.message || String(error)));
        }
    };

    const handleReplaceAll = () => {
        handleReplace();
    };

    const handleUndoAll = () => {
        try {
            if (originalData.length > 0) {
                for (const item of originalData) {
                    try {
                        // 在已优化数据中找到对应原始段落的优化内容
                        const optimizedItem = optimizedData.find(opt => opt.id === item.id);
                        
                        if (!optimizedItem) {
                            continue;
                        }
                        
                        const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
                        for (let i = 1; i <= paragraphCount; i++) {
                            const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                            try {
                                if (paragraph.Range.Text.trim() === optimizedItem.text.trim()) {
                                    paragraph.Range.Text = item.text;
                                    break;
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    } catch (paraError) {
                        console.error(`撤回段落 ${item.id} 时出错:`, paraError);
                    }
                }
                
                // 清空已替换状态
                setReplacedItems(new Set<string>());
                
                message.success('已撤回所有替换内容！');
            } else {
                message.warning('没有可撤回的内容');
            }
        } catch (error: any) {
            message.error('撤回失败: ' + (error.message || String(error)));
        }
    };

    const renderActionButtons = () => {
        const allReplaced = optimizedData.length > 0 && 
                           optimizedData.every(item => replacedItems.has(item.id));
                           
        return (
            <div style={{ textAlign: 'center', marginTop: '30px' }}>
                <Space>
                    {allReplaced ? (
                        <Button 
                            type="primary" 
                            danger
                            size="large" 
                            onClick={handleUndoAll}
                        >
                            全部撤回
                        </Button>
                    ) : (
                        <Button 
                            type="primary" 
                            size="large" 
                            onClick={handleReplaceAll}
                        >
                            全部替换
                        </Button>
                    )}
                    <Button 
                        size="large" 
                        onClick={() => setShowResults(false)}
                    >
                        取消
                    </Button>
                </Space>
            </div>
        );
    };

    const renderComparisonCards = () => {
        if (!showResults) return null;
        
        // 定义卡片宽度
        const cardWidth = 400;
        
        // 过滤数据，只保留有优化内容且优化内容与原始内容不同的项
        const filteredData = originalData.filter(item => {
            const optimizedItem = optimizedData.find(opt => opt.id === item.id);
            return optimizedItem && optimizedItem.text.trim() !== item.text.trim();
        });
        
        if (filteredData.length === 0) {
            return (
                <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                    <h2 style={{ color: 'white', textAlign: 'center', marginBottom: '20px' }}>优化结果对比</h2>
                    <Card style={{ maxWidth: '500px', margin: '0 auto' }}>
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <p>没有需要优化的内容或优化内容与原内容相同</p>
                            <Button 
                                size="large" 
                                onClick={() => setShowResults(false)}
                                style={{ marginTop: '15px' }}
                            >
                                返回
                            </Button>
                        </div>
                    </Card>
                </div>
            );
        }
        
        return (
            <div style={{ marginTop: '20px', width: '100%' }}>
                <h2 style={{ color: 'white', textAlign: 'center', marginBottom: '20px' }}>优化结果对比</h2>
                <Row gutter={[16, 16]} justify="center">
                    {filteredData.map((item, index) => {
                        const optimizedItem = optimizedData.find(opt => opt.id === item.id);
                        const isReplaced = replacedItems.has(item.id);
                        
                        return (
                            <Col xs={24} sm={12} md={8} key={item.id} style={{ 
                                marginBottom: '16px',
                                display: 'flex',
                                justifyContent: 'center'
                            }}>
                                <Card 
                                    bordered={true}
                                    style={{ 
                                        width: cardWidth,
                                        cursor: 'pointer',
                                        transition: 'all 0.3s',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                                        borderColor: isReplaced ? '#52c41a' : 'transparent',
                                        borderWidth: isReplaced ? '2px' : '1px'
                                    }}
                                    bodyStyle={{
                                        padding: '12px',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}
                                    hoverable
                                    onClick={() => handleLocateInDocument(item.id, item.text)}
                                >
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center',
                                            marginBottom: '8px' 
                                        }}>
                                            <h4 style={{ margin: 0 }}>原始内容:</h4>
                                            <Tooltip title="定位到文档">
                                                <AimOutlined style={{ color: '#52c41a' }} />
                                            </Tooltip>
                                        </div>
                                        <Tooltip title={item.text} placement="topLeft" color="#fff" overlayInnerStyle={{ color: '#333' }}>
                                            <div style={{ 
                                                maxHeight: '200px', 
                                                overflow: 'auto',
                                                marginBottom: '16px',
                                                padding: '8px',
                                                background: '#f9f9f9',
                                                borderRadius: '4px',
                                                textOverflow: 'ellipsis',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 5,
                                                WebkitBoxOrient: 'vertical'
                                            }}>
                                                {item.text}
                                            </div>
                                        </Tooltip>
                                        
                                        {optimizedItem && (
                                            <>
                                                <h4>优化后内容:</h4>
                                                <Tooltip title={optimizedItem.text} placement="topLeft" color="#fff" overlayInnerStyle={{ color: '#333' }}>
                                                    <div style={{ 
                                                        maxHeight: '200px', 
                                                        overflow: 'auto',
                                                        color: '#1890ff', 
                                                        padding: '8px',
                                                        background: '#f0f8ff',
                                                        borderRadius: '4px',
                                                        marginBottom: '16px',
                                                        textOverflow: 'ellipsis',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 5,
                                                        WebkitBoxOrient: 'vertical'
                                                    }}>
                                                        {optimizedItem.text}
                                                    </div>
                                                </Tooltip>
                                                
                                                <div style={{ textAlign: 'center', marginTop: 'auto' }}>
                                                    {isReplaced ? (
                                                        <Button 
                                                            type="text" 
                                                            danger
                                                            icon={<SyncOutlined />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleUndoReplace(item);
                                                            }}
                                                        >
                                                            撤回
                                                        </Button>
                                                    ) : (
                                                        <Button 
                                                            type="text" 
                                                            icon={<SyncOutlined />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReplaceItem(item, optimizedItem);
                                                            }}
                                                        >
                                                            替换此段
                                                        </Button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </Card>
                            </Col>
                        );
                    })}
                </Row>
                
                {renderActionButtons()}
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
                renderComparisonCards()
            ) : (
                <Button 
                    type="primary" 
                    onClick={handleStartProcess}
                    size="large"
                >
                    开始处理
                </Button>
            )}
        </div>
    );
};

export default ArticleOptimizationPage; 