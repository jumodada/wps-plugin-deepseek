import { useState, useRef } from 'react';
import { Button, message, Progress } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { submitOptimization } from '../api/deepseek';
import { xx } from './xx.js';

const extractTextFromXML = (xmlContent: string): { id: string, text: string }[] => {
    try {
        const result: { id: string, text: string }[] = [];
        
        
        const bodyMatch = xmlContent.match(/<w:body>[\s\S]*?<\/w:body>/);
        if (!bodyMatch) return result;
        
        const bodyContent = bodyMatch[0];
        
        
        const paragraphRegex = /<w:p\s+(?:[^>]*\s+)?w14:paraId="([^"]+)"[^>]*>([\s\S]*?)<\/w:p>/g;
        let paragraphMatch;
        
        while ((paragraphMatch = paragraphRegex.exec(bodyContent)) !== null) {
            const paraId = paragraphMatch[1];
            const paragraphContent = paragraphMatch[2];
            
            
            const textRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
            let textMatch;
            let paragraphText = '';
            
            while ((textMatch = textRegex.exec(paragraphContent)) !== null) {
                paragraphText += textMatch[1];
            }
            
            if (paragraphText.trim()) {
                result.push({
                    id: paraId,
                    text: paragraphText.trim()
                });
            }
        }
        
        return result;
    } catch (error) {
        console.error('XML解析错误:', error);
        return []; 
    }
};


const structuredDataToText = (data: { id: string, text: string }[]): string => {
    return data.map(item => item.text).join('\n\n');
};


const isXMLContent = (content: string): boolean => {
    return content.trim().startsWith('<?xml') || content.trim().startsWith('<w:');
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
            
            //const articleContent = window._Application.ActiveDocument.WordOpenXML;
            const articleContent = xx;
            if (!articleContent || articleContent.trim() === '') {
                message.warning('文档内容为空，无法进行处理');
                setLoading(false);
                return;
            }
            
            
            const isXML = isXMLContent(articleContent);
            
            
            let contentToProcess = '';
            let structuredData: { id: string, text: string }[] = [];
            
            if (isXML) {
                setProcessingStatus('正在提取文档结构化内容...');
                structuredData = extractTextFromXML(articleContent);
                contentToProcess = structuredDataToText(structuredData);
                
                if (structuredData.length === 0) {
                    message.warning('无法从文档中提取有效内容');
                    setLoading(false);
                    return;
                }
            } else {
                contentToProcess = articleContent;
            }
            
            
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
                    
                    // 提取当前块中的结构化数据
                    const currentChunkData = isXML 
                        ? structuredData.filter(item => chunk.includes(item.text)) 
                        : [{ id: `chunk_${i}`, text: chunk }];
                    
                    const structuredInput = currentChunkData.map(item => `ID: ${item.id}\n内容: ${item.text}`).join('\n\n');
                    
                    const params = {
                        messages: [{
                            role: "user",
                            content: `请对以下文章内容进行优化，提升其表达质量和专业度${formatInstruction}。
每段内容都有ID和对应的文本，请保持相同的格式返回，确保每段优化后的内容都有对应的ID：

${structuredInput}`
                        }],
                        model: "deepseek-chat",
                        signal: cancelTokenRef.current?.signal
                    };
                    
                    const response = await retryOptimization(params);
                    
                    if (processingRef.current && response.data && response.data.choices && response.data.choices.length > 0) {
                        const chunkResult = response.data.choices[0].message.content;
                        
                        // 处理返回的结构化数据
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
                        
                        const newProgress = Math.round(((i + 1) / chunks.length) * 100);
                        setProgress(newProgress);
                    } else if (processingRef.current) {
                        failedChunks++;
                        
                        // 失败时保留原始内容
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
                        
                        // 错误时保留当前块的原始内容
                        const currentChunkData = isXML 
                            ? structuredData.filter(item => chunks[i].includes(item.text)) 
                            : [{ id: `chunk_${i}`, text: chunks[i] }];
                            
                        currentChunkData.forEach(item => {
                            optimizedStructuredData.push(item);
                            optimizedContent += (optimizedContent ? '\n\n' : '') + item.text;
                        });
                        
                        console.error(`处理第${i+1}部分时出错:`, error);
                    }
                }
            }
            
            
            if (processingRef.current) {
                
                if (isXML && structuredData.length > 0) {
                    setProcessingStatus('正在将优化后的内容重新应用到文档结构...');
                    
                    // 使用优化后的结构化数据直接更新
                    const updatedXML = updateXMLWithStructuredData(articleContent, optimizedStructuredData);
                    
                    
                    
                    
                    
                    window._Application.ActiveDocument.Content = structuredDataToText(optimizedStructuredData);
                } else {
                    
                    window._Application.ActiveDocument.Content = optimizedContent;
                }
                
                if (failedChunks > 0) {
                    message.warning(`处理部分成功！有${failedChunks}/${chunks.length}个部分未能成功处理。`);
                } else {
                    message.success('处理成功！');
                }
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

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'white' }}>
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