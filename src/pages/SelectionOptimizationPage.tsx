import { useState, useRef, useEffect } from 'react';
import { message, Card, Row, Col, Space, Tooltip, Spin } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { submitOptimization, generateDiffAnalysis } from '../api/deepseek';
import { usePageReset } from '../hooks';

// 提取选中文本的函数
const extractSelectedText = (): { id: string, text: string } | null => {
    try {
        const selection = window._Application?.Selection;
        if (!selection || selection.Text.trim() === '') {
            return null;
        }
        
        // 获取选中文本所在段落的ID
        const paragraph = selection.Paragraphs.Item(1);
        const paraId = paragraph.ParaID;
        const text = selection.Text.trim();
        
        return {
            id: paraId,
            text: text
        };
    } catch (error) {
        console.error('获取选中文本时出错:', error);
        return null;
    }
};

const isWordDocument = (): boolean => {
    return !!window._Application?.ActiveDocument;
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

const SelectionOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [originalItem, setOriginalItem] = useState<{ id: string, text: string } | null>(null);
    const [optimizedItem, setOptimizedItem] = useState<{ id: string, text: string, diff?: string[], replaced?: boolean } | null>(null);
    const [showResults, setShowResults] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [replacedItems, setReplacedItems] = useState<Set<string>>(new Set());
    
    // 使用文档切换监听钩子，当文档切换时重置页面状态
    const handleReset = () => {
        setLoading(false);
        setProcessingStatus('');
        setOriginalItem(null);
        setOptimizedItem(null);
        setShowResults(false);
        setIsActive(false);
        setReplacedItems(new Set());
        
        // 恢复样式
        restoreOriginalStyle();
        
        handleStartProcess();
    };
    
    // 应用页面重置钩子
    usePageReset(handleReset);
    
    const cardRef = useRef<HTMLDivElement | null>(null);
    const originalStylesMap = useRef<Map<string, { underline: number, color: number }>>(new Map());
    const cancelTokenRef = useRef<AbortController | null>(null);
    const processingRef = useRef<boolean>(false);
    
    // 恢复指定段落原始文本样式的函数
    const restoreOriginalStyle = (paragraphId?: string) => {
        if (paragraphId) {
            const originalStyle = originalStylesMap.current.get(paragraphId);
            if (originalStyle) {
                const paragraphCount = window._Application.ActiveDocument?.Paragraphs.Count;
                for (let i = 1; i <= paragraphCount; i++) {
                    const paragraph = window._Application.ActiveDocument?.Paragraphs.Item(i);
                    if (paragraph.ParaID === paragraphId) {
                        const underline = originalStyle.underline === 9999999 ? 0 : originalStyle.underline;
                        const color = originalStyle.color === 9999999 ? 0 : originalStyle.color;
                        paragraph.Range.Font.Underline = underline;
                        paragraph.Range.Font.Color = color;
                        break;
                    }
                }
            }
        } else {
            // 恢复所有段落样式
            originalStylesMap.current.forEach((_, paragraphId) => {
                restoreOriginalStyle(paragraphId);
            });
        }
    };
    
    const handleStartProcess = async () => {
        cancelTokenRef.current = new AbortController();
        processingRef.current = true;

        setLoading(true);

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
        setProcessingStatus('正在优化内容...');

        try {
            // 第一步：进行文本优化
            const params = {
                messages: [
                    {
                        role: "system",
                        content: "你是一个专业的文章优化助手。请仅对文本进行词语替换和优化，不要添加大量新文本。如果判断文本不需要优化，请原样返回。"
                    },
                    {
                        role: "user",
                        content: `请对以下段落内容进行优化，保持原意和格式：\n\n${selectedText.text}`
                    }
                ],
                model: "deepseek-reasoner",
                signal: cancelTokenRef.current?.signal
            };
            
            const response = await retryOptimization(params);
            
            if (!processingRef.current) {
                setLoading(false);
                return;
            }
            
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const optimizedText = response.data.choices[0].message.content.trim();
                
                // 如果优化结果和原文相同，直接返回
                if (optimizedText === selectedText.text.trim()) {
                    setOptimizedItem({
                        id: selectedText.id,
                        text: optimizedText,
                        diff: []
                    });
                    setShowResults(true);
                    message.info('文本无需优化，内容已保持原样');
                    setLoading(false);
                    return;
                }
                
                // 第二步：获取差异分析
                setProcessingStatus('正在分析文本差异...');
                
                try {
                    const diffResponse = await generateDiffAnalysis({
                        original: selectedText.text,
                        optimized: optimizedText,
                        signal: cancelTokenRef.current?.signal
                    });
                    
                    if (!processingRef.current) {
                        setLoading(false);
                        return;
                    }
                    
                    if (diffResponse.data && diffResponse.data.choices && diffResponse.data.choices.length > 0) {
                        const diffResult = diffResponse.data.choices[0].message.content;
                        let diffArray: string[] = [];
                        
                        try {
                            // 尝试解析JSON格式
                            diffArray = JSON.parse(diffResult);
                            if (!Array.isArray(diffArray)) {
                                // 尝试从文本中提取JSON
                                const jsonMatch = diffResult.match(/(\[.*\])/s);
                                if (jsonMatch) {
                                    try {
                                        diffArray = JSON.parse(jsonMatch[1]);
                                        if (!Array.isArray(diffArray)) {
                                            diffArray = [];
                                        }
                                    } catch (e) {
                                        console.error('解析差异结果失败:', e);
                                        diffArray = [];
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('解析差异结果失败:', e);
                            // 尝试从文本中提取JSON
                            const jsonMatch = diffResult.match(/(\[.*\])/s);
                            if (jsonMatch) {
                                try {
                                    diffArray = JSON.parse(jsonMatch[1]);
                                    if (!Array.isArray(diffArray)) {
                                        diffArray = [];
                                    }
                                } catch (e2) {
                                    console.error('再次解析差异结果失败:', e2);
                                    diffArray = [];
                                }
                            }
                        }
                        
                        setOptimizedItem({
                            id: selectedText.id,
                            text: optimizedText,
                            diff: diffArray
                        });
                    } else {
                        // 没有差异分析结果
                        setOptimizedItem({
                            id: selectedText.id,
                            text: optimizedText,
                            diff: []
                        });
                    }
                } catch (error) {
                    // 差异分析失败，仍然返回优化结果
                    console.error('差异分析失败:', error);
                    setOptimizedItem({
                        id: selectedText.id,
                        text: optimizedText,
                        diff: []
                    });
                }
                
                setShowResults(true);
                message.success('内容优化完成！');
            } else {
                message.error('获取优化结果失败');
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
                setProcessingStatus('');
                processingRef.current = false;
            }
        }
    };

    const handleReplaceItem = (originalText: { id: string, text: string }, optimizedText: { id: string, text: string, replaced?: boolean }) => {
        if (isActive) {
            restoreOriginalStyle(originalText.id);
            originalStylesMap.current.delete(originalText.id);
        }
        setIsActive(false);
        
        const paragraphCount = window._Application.ActiveDocument?.Paragraphs.Count;
        let replaced = false;

        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window._Application.ActiveDocument?.Paragraphs.Item(i);
            if (paragraph.ParaID === originalText.id) {
                paragraph.Range.Copy();
                paragraph.Range.InsertParagraphAfter();
                window._Application.ActiveDocument?.Paragraphs.Item(i + 1).Range.Paste();
                const originalStyle = {...paragraph.Style};
                const originalFont = {...paragraph.Style.Font};
                const CharacterUnitFirstLineIndent = paragraph.Range.ParagraphFormat.CharacterUnitFirstLineIndent;
                const CharacterUnitLeftIndent = paragraph.Range.ParagraphFormat.CharacterUnitLeftIndent;
                const firstLineIndent = paragraph.Range.ParagraphFormat.FirstLineIndent;
                let newText = optimizedText.text;
                if (!newText.endsWith('\r')) {
                    newText = newText + '\r';
                }
                paragraph.Range.Text = newText;
                window._Application.ActiveDocument?.Paragraphs.Item(i + 1).Range.Delete();
                paragraph.Style = originalStyle;
                paragraph.Style.Font = originalFont;
                paragraph.Range.ParagraphFormat.CharacterUnitFirstLineIndent = CharacterUnitFirstLineIndent;
                paragraph.Range.ParagraphFormat.CharacterUnitLeftIndent = CharacterUnitLeftIndent;
                paragraph.Range.ParagraphFormat.FirstLineIndent = firstLineIndent;
                replaced = true;
                break;
            }
        }

        if (replaced) {
            if (optimizedItem) {
                setOptimizedItem({...optimizedItem, replaced: true});
            }
            window._Application.ActiveDocument.Sync.PutUpdate();

            setReplacedItems(prev => {
                const newSet = new Set(prev);
                newSet.add(originalText.id);
                return newSet;
            });
            
            originalStylesMap.current.delete(originalText.id);
            message.success(`已替换内容`);
            
            // 替换后关闭结果页面
            setTimeout(() => {
                setShowResults(false);
            }, 500);
        } else {
            message.warning(`未找到原文内容相符的段落`);
        }
    };

    const handleLocateInDocument = (paragraphId: string) => {
        if (isActive) {
            restoreOriginalStyle(paragraphId);
            setIsActive(false);
            originalStylesMap.current.delete(paragraphId);
            return;
        }
        
        const paragraphCount = window._Application.ActiveDocument?.Paragraphs.Count;
        let found = false;

        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window._Application.ActiveDocument?.Paragraphs.Item(i);
            if (paragraph.ParaID === paragraphId) {
                paragraph.Range.Select();
                found = true;

                const selection = window._Application.Selection;
                const underlineStyle = selection.Font.Underline === 9999999 ? 0 : selection.Font.Underline;
                const colorStyle = selection.Font.Color === 9999999 ? 0 : selection.Font.Color;
                
                originalStylesMap.current.set(paragraphId, {
                    underline: underlineStyle,
                    color: colorStyle
                });
                
                selection.Font.Underline = 11;
                selection.Font.Color = 255;
                
                setIsActive(true);

                if (cardRef.current) {
                    cardRef.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }

                break;
            }
        }

        if (!found) {
            message.warning('未找到对应内容的段落');
        }
    };

    // 保留一个简化版的highlightTextChanges作为备选方案
    const highlightTextChanges = (originalText: string, optimizedText: string) => {
        // 简单的差异展示逻辑
        const cleanOriginalText = originalText.replace(/\r/g, '');
        const cleanOptimizedText = optimizedText.replace(/\r/g, '');
        
        if (cleanOriginalText === cleanOptimizedText) {
            return { changesSummary: '' };
        }
        
        // 如果原文和优化后文本长度相近，假定为词语替换
        if (Math.abs(cleanOriginalText.length - cleanOptimizedText.length) < Math.min(cleanOriginalText.length, cleanOptimizedText.length) * 0.3) {
            return { 
                changesSummary: `<span style="color: #FF8080; text-decoration: line-through;">原文</span> → <span style="color: #52c41a;">优化后</span>` 
            };
        }
        
        // 如果优化后文本较长，假定为添加内容
        if (cleanOptimizedText.length > cleanOriginalText.length * 1.3) {
            return { 
                changesSummary: `<span style="color: #52c41a;">+添加了内容</span>` 
            };
        }
        
        // 如果优化后文本较短，假定为删减内容
        if (cleanOptimizedText.length < cleanOriginalText.length * 0.7) {
            return { 
                changesSummary: `<span style="color: #FF8080; text-decoration: line-through;">删减了内容</span>` 
            };
        }
        
        // 默认返回通用提示
        return { 
            changesSummary: `<span style="color: #1890ff;">文本已优化</span>` 
        };
    };

    // 替换highlightTextChanges函数，使用deepseek返回的diff数据
    const renderDiffChanges = (diffArray?: string[]) => {
        if (!diffArray || diffArray.length === 0) {
            return { changesSummary: '' };
        }
        
        // 将diff数组转换为HTML
        const changesSummary = diffArray.map(diff => {
            // 处理替换模式: "A → B"
            if (diff.includes('→')) {
                const [original, optimized] = diff.split('→').map(s => s.trim());
                return `<span style="color: #FF8080; text-decoration: line-through;">${original}</span> → <span style="color: #52c41a;">${optimized}</span>`;
            }
            // 处理删除模式: "-A" 或 "删除A"
            else if (diff.startsWith('-') || diff.includes('删除')) {
                const deletedText = diff.startsWith('-') ? diff.substring(1).trim() : diff.replace(/删除/g, '').trim();
                return `<span style="color: #FF8080; text-decoration: line-through;">${deletedText}</span>`;
            }
            // 处理添加模式: "+A" 或 "添加A"
            else if (diff.startsWith('+') || diff.includes('添加')) {
                const addedText = diff.startsWith('+') ? diff.substring(1).trim() : diff.replace(/添加/g, '').trim();
                return `<span style="color: #52c41a;">+${addedText}</span>`;
            }
            // 其他情况直接显示
            return `<span>${diff}</span>`;
        }).join(', ');
        
        return { changesSummary };
    };

    const renderComparisonCard = () => {
        if (!showResults || !originalItem || !optimizedItem) return null;
        
        if (originalItem.text.trim() === optimizedItem.text.trim() || optimizedItem.replaced) {
            return (
                <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                    <Card style={{ maxWidth: '500px', margin: '0 auto', borderLeft: '3px solid #1890ff' }}>
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <p>{optimizedItem.replaced ? '内容已替换成功' : '优化内容与原内容相同，无需替换'}</p>
                            <span
                                style={{ 
                                    cursor: 'pointer', 
                                    color: '#999',
                                    fontSize: '15px',
                                    marginTop: '15px',
                                    display: 'inline-block'
                                }}
                                onClick={() => {
                                    restoreOriginalStyle(originalItem.id);
                                    setIsActive(false);
                                    setShowResults(false);
                                }}
                            >
                                <CloseOutlined style={{ marginRight: '5px' }} />
                                返回
                            </span>
                        </div>
                    </Card>
                </div>
            );
        }
        
        // 获取变化摘要，优先使用deepseek返回的diff数据
        const { changesSummary } = optimizedItem.diff && optimizedItem.diff.length > 0
            ? renderDiffChanges(optimizedItem.diff) 
            : highlightTextChanges(originalItem.text, optimizedItem.text);
        
        // 定义卡片宽度
        const cardWidth = 400;
        
        return (
            <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
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
                        borderLeft: '3px solid #1890ff',
                        overflow: 'hidden'
                    }}
                    bodyStyle={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        background: isActive ? '#f0f8ff' : '',
                        width: '100%',
                        overflow: 'hidden'
                    }}
                    hoverable
                    onClick={() => handleLocateInDocument(originalItem.id)}
                >
                    <div style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column',
                        width: '100%',
                        overflow: 'hidden'
                    }}>
                        {changesSummary && (
                            <div 
                                style={{
                                    fontSize: '12px',
                                    marginBottom: '8px',
                                    padding: '6px',
                                    borderRadius: '4px',
                                    background: '#f9f9f9',
                                    borderLeft: '2px solid #1890ff',
                                    width: '100%',
                                    overflow: 'hidden'
                                }}
                            >
                                <div 
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                    dangerouslySetInnerHTML={{ __html: changesSummary }}
                                />
                            </div>
                        )}
                        <Tooltip 
                            title={optimizedItem.text} 
                            placement="topLeft" 
                            color="#fff" 
                            overlayInnerStyle={{ color: '#333', maxWidth: '400px', maxHeight: '300px', overflow: 'auto' }}
                            mouseEnterDelay={0.5}
                        >
                            <div
                                style={{
                                    maxHeight: '200px',
                                    overflow: 'hidden',
                                    color: replacedItems.has(originalItem.id) ? '#999' : '#bbc6ce',
                                    padding: '8px',
                                    background: '#f0f8ff',
                                    borderRadius: '4px',
                                    marginBottom: '16px',
                                    textDecoration: replacedItems.has(originalItem.id) ? 'line-through' : 'none',
                                    width: '100%',
                                    maxWidth: '400px'
                                }}
                            >
                                <div style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 5,
                                    WebkitBoxOrient: 'vertical',
                                    wordBreak: 'break-word',
                                    wordWrap: 'break-word'
                                }}>
                                    {optimizedItem.text}
                                </div>
                            </div>
                        </Tooltip>

                        <div style={{ textAlign: 'left', marginTop: 'auto', display: 'flex', justifyContent: 'flex-start', gap: '15px' }}>
                            <span
                                style={{ 
                                    cursor: 'pointer', 
                                    color: '#1890ff',
                                    fontSize: '13px'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleReplaceItem(originalItem, optimizedItem);
                                }}
                            >
                                <CheckOutlined style={{ marginRight: '3px' }} />
                                替换
                            </span>
                            <span
                                style={{ 
                                    cursor: 'pointer', 
                                    color: '#999',
                                    fontSize: '13px'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isActive) {
                                        restoreOriginalStyle(originalItem.id);
                                        setIsActive(false);
                                        originalStylesMap.current.delete(originalItem.id);
                                    }
                                    if (optimizedItem) {
                                        setOptimizedItem({...optimizedItem, replaced: true});
                                    }
                                    setReplacedItems(prev => {
                                        const newSet = new Set(prev);
                                        newSet.add(originalItem.id);
                                        return newSet;
                                    });
                                    setTimeout(() => {
                                        setShowResults(false);
                                    }, 500);
                                }}
                            >
                                <CloseOutlined style={{ marginRight: '3px' }} />
                                忽略
                            </span>
                        </div>
                    </div>
                </Card>
            </div>
        );
    };

    // 页面加载时自动开始处理
    useEffect(() => {
        handleStartProcess();
    }, []);

    return (
        <div style={{ padding: '5px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f0f2f5', color: '#333' }}>
            {loading ? (
                <div style={{ width: '100%', maxWidth: '500px', textAlign: 'center', color: '#333' }}>
                    {processingStatus && <p style={{ marginBottom: '20px', color: '#333' }}>{processingStatus}</p>}
                    <Spin size="large" />
                </div>
            ) : showResults ? (
                renderComparisonCard()
            ) : null}
        </div>
    );
};

export default SelectionOptimizationPage; 