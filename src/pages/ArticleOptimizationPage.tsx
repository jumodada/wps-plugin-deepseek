import { useState, useRef, useEffect } from 'react';
import { message, Card, Row, Col, Space, Tooltip, Spin, Collapse } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { submitOptimization, generateDiffAnalysis } from '../api/deepseek';
import { usePageReset } from '../hooks';

// 处理文档中的图片换行问题
const handleImageLineBreak = (): void => {
    try {
        const ActiveDocument = window._Application?.ActiveDocument;
        if (!ActiveDocument) return;
        
        const pcount = ActiveDocument.InlineShapes;
        
        for (var i = 1; i <= pcount.Count; i = i + 1) {
            var pc = pcount.Item(i);
            pc.Range.InsertBefore("\n");
        }
        
        ActiveDocument.Sync.PutUpdate();
    } catch (error) {
        console.error('处理图片换行失败:', error);
    }
};

const extractParagraphsFromDocument = (): { id: string, text: string }[] => {
    const result: { id: string, text: string }[] = [];
    const document = window._Application?.ActiveDocument;
    const paragraphCount = document.Paragraphs.Count;

    for (let i = 1; i <= paragraphCount; i++) {
        const paragraph = document.Paragraphs.Item(i);
        const paraId = paragraph.ParaID;
        const text = paragraph.Range.Text;

        if (text.trim()) {
            result.push({
                id: paraId,
                text: text
            });
        }
    }
    return result;
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

const ArticleOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [originalData, setOriginalData] = useState<{ id: string, text: string }[]>([]);
    const [optimizedData, setOptimizedData] = useState<{ 
        id: string, 
        text: string, 
        diff?: string[],
        notImprove?: boolean,
        replaced?: boolean
    }[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [replacedItems, setReplacedItems] = useState<Set<string>>(new Set());
    const [activeCardId, setActiveCardId] = useState<string | null>(null);
    const [activeDocumentName, setActiveDocumentName] = useState<string | null>(null);
    
    const handleReset = () => {
        setLoading(false);
        setProcessingStatus('');
        setOriginalData([]);
        setOptimizedData([]);
        setShowResults(false);
        setReplacedItems(new Set());
        setActiveCardId(null);
        restoreAllOriginalStyles();
        handleStartProcess();
    };
    
    usePageReset(handleReset);
    
    const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const previousActiveCardId = useRef<string | null>(null);
    const originalStylesMap = useRef<Map<string, { underline: number, color: number }>>(new Map());
    const cancelTokenRef = useRef<AbortController | null>(null);
    const processingRef = useRef<boolean>(false);

    // 恢复指定段落原始文本样式的函数
    const restoreOriginalStyle = (paragraphId: string) => {
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
    };

    const restoreAllOriginalStyles = () => {
        originalStylesMap.current.forEach((_, paragraphId) => {
            restoreOriginalStyle(paragraphId);
        });
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

    const handleStartProcess = async () => {
        cancelTokenRef.current = new AbortController();
        processingRef.current = true;

        setLoading(true);

        if (!isWordDocument()) {
            setLoading(false);
            return;
        }

        setProcessingStatus('正在处理文档中的图片...');
        // 先处理图片换行问题
        handleImageLineBreak();

        setProcessingStatus('正在提取文档段落内容...');
        const structuredData = extractParagraphsFromDocument();

        if (structuredData.length === 0) {
            message.warning('无法从文档中提取有效内容');
            setLoading(false);
            return;
        }

        // 检查是否有缓存数据
        const cacheKey = `optimization_cache_${window._Application.ActiveDocument?.Name}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                const parsedCache = JSON.parse(cachedData);
                // 检查缓存数据是否与当前文档内容匹配
                if (parsedCache.originalData && 
                    parsedCache.originalData.length === structuredData.length &&
                    parsedCache.originalData.every((item: any, index: number) => 
                        item.id === structuredData[index].id && 
                        item.text === structuredData[index].text
                    )) {
                    setOriginalData(parsedCache.originalData);
                    setOptimizedData(parsedCache.optimizedData);
                    setShowResults(true);
                    setLoading(false);
                    message.success('使用缓存数据');
                    return;
                }
            } catch (error) {
                console.error('解析缓存数据失败:', error);
                localStorage.removeItem(cacheKey);
            }
        }

        setOriginalData(structuredData);
        setProcessingStatus(`正在处理文档内容...`);

        try {
            // 第一次调用API进行文本优化
            const params = {
                messages: [
                    {
                        role: "system",
                        content: `你是一个专业的文章优化助手。请仅对文本进行词语替换和优化，不要添加大量新文本。对于数组中的第一个元素（如果存在），视为标题，不要增加其字数。如果判断某段文本不需要优化，请滤除这一条。`
                    },
                    {
                        role: "user",
                        content: `请对以下JSON格式的文章内容进行优化，返回优化后的JSON格式内容，如果判断某段文本不需要优化，请在JSON数据里面滤除这条：\n\n${JSON.stringify(structuredData)}`
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
                const result = response.data.choices[0].message.content;
                const jsonMatch = result.match(/(\[.*\])/s);
                const jsonStr = jsonMatch ? jsonMatch[1] : result;
                
                try {
                    let optimizedItems: Array<{ id: string, text: string, notImprove?: boolean }> = [];
                    
                    const resultData = JSON.parse(jsonStr);
                    if (Array.isArray(resultData)) {
                        optimizedItems = resultData.map(item => ({
                            ...item,
                            text: item.text.replace(/\r$/, '')
                        }));
                    } else {
                        const resultBlocks = result.split(/\n\s*\n/);
                        for (const block of resultBlocks) {
                            const idMatch = block.match(/ID:\s*([^\n]+)/);
                            const contentMatch = block.match(/内容:\s*([\s\S]+)$/);
                            const notImproveMatch = block.match(/不需要优化/i) || block.match(/保持原样/i);

                            if (idMatch && contentMatch) {
                                const id = idMatch[1].trim();
                                const optimizedText = contentMatch[1].trim().replace(/\r$/, '');

                                optimizedItems.push({
                                    id,
                                    text: optimizedText,
                                    notImprove: !!notImproveMatch
                                });
                            }
                        }
                    }
                    
                    // 如果没有有效项目，使用原始内容
                    if (optimizedItems.length === 0) {
                        const finalData = structuredData.map(item => ({ ...item, notImprove: true }));
                        setOptimizedData(finalData);
                        message.warning('没有可优化的内容');
                        setShowResults(true);
                        setLoading(false);
                        return;
                    }
                    
                    // 第二步：为每个优化项生成差异分析
                    setProcessingStatus('正在分析文本差异...');
                    
                    const itemsWithDiff: Array<{ id: string, text: string, diff: string[], notImprove?: boolean }> = [];
                    const originalItemMap = new Map(structuredData.map(item => [item.id, item]));
                    
                    // 对有变化的项目进行差异分析
                    for (const optimizedItem of optimizedItems) {
                        const originalItem = originalItemMap.get(optimizedItem.id);
                        if (!originalItem || optimizedItem.notImprove || originalItem.text.trim() === optimizedItem.text.trim()) {
                            // 无需差异分析的项目
                            itemsWithDiff.push({
                                ...optimizedItem,
                                diff: []
                            });
                            continue;
                        }
                        
                        try {
                            const diffResponse = await generateDiffAnalysis({
                                original: originalItem.text,
                                optimized: optimizedItem.text,
                                signal: cancelTokenRef.current?.signal
                            });
                            
                            if (!processingRef.current) {
                                setLoading(false);
                                return;
                            }
                            
                            if (diffResponse.data && diffResponse.data.choices && diffResponse.data.choices.length > 0) {
                                const diffResult = diffResponse.data.choices[0].message.content;
                                
                                // 解析返回的差异数组
                                try {
                                    // 尝试直接解析JSON格式
                                    const diffArray = JSON.parse(diffResult);
                                    itemsWithDiff.push({
                                        ...optimizedItem,
                                        diff: Array.isArray(diffArray) ? diffArray : []
                                    });
                                } catch (e) {
                                    // 尝试从文本中提取JSON
                                    const jsonMatch = diffResult.match(/(\[.*\])/s);
                                    if (jsonMatch) {
                                        try {
                                            const diffArray = JSON.parse(jsonMatch[1]);
                                            itemsWithDiff.push({
                                                ...optimizedItem,
                                                diff: Array.isArray(diffArray) ? diffArray : []
                                            });
                                        } catch (e2) {
                                            // 如果无法解析，添加没有差异的项
                                            itemsWithDiff.push({
                                                ...optimizedItem,
                                                diff: []
                                            });
                                        }
                                    } else {
                                        // 没有找到JSON格式
                                        itemsWithDiff.push({
                                            ...optimizedItem,
                                            diff: []
                                        });
                                    }
                                }
                            } else {
                                // 没有返回有效结果
                                itemsWithDiff.push({
                                    ...optimizedItem,
                                    diff: []
                                });
                            }
                        } catch (error: any) {
                            // 差异分析失败
                            console.error('差异分析失败:', error);
                            itemsWithDiff.push({
                                ...optimizedItem,
                                diff: []
                            });
                        }
                    }
                    
                    setOptimizedData(itemsWithDiff);
                    setShowResults(true);
                    setLoading(false);
                    
                    // 保存到 localStorage
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify({
                            originalData: structuredData,
                            optimizedData: itemsWithDiff
                        }));
                    } catch (error) {
                        console.error('保存缓存数据失败:', error);
                    }
                    
                    message.success('处理完成！请查看优化结果并选择是否替换。');
                } catch (error) {
                    console.error('解析结果失败:', error);
                    setOptimizedData(structuredData.map(item => ({ ...item, notImprove: true })));
                    setShowResults(true);
                    setLoading(false);
                    message.warning('无法解析优化结果，将显示原始内容');
                }
            } else {
                setLoading(false);
                message.error('处理失败，请重试');
            }
        } catch (error: any) {
            console.error('处理失败:', error);
            setLoading(false);
            if (error.name !== 'AbortError') {
                message.error('处理失败，请重试');
            }
        }
    };

    const handleReplaceItem = (originalItem: { id: string, text: string }, optimizedItem: { id: string, text: string, replaced?: boolean }) => {
        if (activeCardId) {
            restoreOriginalStyle(activeCardId);
            originalStylesMap.current.delete(activeCardId);
        }
        setActiveCardId(null);
        
        const paragraphCount = window._Application.ActiveDocument?.Paragraphs.Count;
        let replaced = false;

        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window._Application.ActiveDocument?.Paragraphs.Item(i);
            if (paragraph.ParaID === originalItem.id) {
                paragraph.Range.Copy();
                paragraph.Range.InsertParagraphAfter();
                window._Application.ActiveDocument?.Paragraphs.Item(i + 1).Range.Paste();
                const originalStyle = {...paragraph.Style};
                const originalFont = {...paragraph.Style.Font};
                const CharacterUnitFirstLineIndent = paragraph.Range.ParagraphFormat.CharacterUnitFirstLineIndent;
                const CharacterUnitLeftIndent = paragraph.Range.ParagraphFormat.CharacterUnitLeftIndent;
                const firstLineIndent = paragraph.Range.ParagraphFormat.FirstLineIndent;
                let newText = optimizedItem.text;
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
            const newOptimizedData = [...optimizedData];
            const itemIndex = newOptimizedData.findIndex(item => item.id === optimizedItem.id);
            if (itemIndex !== -1) {
                newOptimizedData[itemIndex] = {...optimizedItem, replaced: true};
                setOptimizedData(newOptimizedData);
                window._Application.ActiveDocument.Sync.PutUpdate();
            }

            setReplacedItems(prev => {
                const newSet = new Set(prev);
                newSet.add(originalItem.id);
                return newSet;
            });
            
            originalStylesMap.current.delete(originalItem.id);
            message.success(`已替换内容`);
        } else {
            message.warning(`未找到原文内容相符的段落`);
        }
    };

    const handleLocateInDocument = (paragraphId: string) => {
        if (activeCardId && activeCardId !== paragraphId) {
            restoreOriginalStyle(activeCardId);
            setActiveCardId(null);
        }
        
        if (activeCardId === paragraphId) {
            restoreOriginalStyle(paragraphId);
            setActiveCardId(null);
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
                
                setActiveCardId(paragraphId);

                if (cardRefs.current[paragraphId]) {
                    cardRefs.current[paragraphId]?.scrollIntoView({
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

    const renderActionButtons = () => {
        return (
            <div style={{ textAlign: 'center', marginTop: '30px' }}>
                <Space size="large">
                    <span
                        style={{ 
                            cursor: 'pointer', 
                            color: '#999',
                            fontSize: '15px'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            restoreAllOriginalStyles();
                            setActiveCardId(null);
                            setShowResults(false);
                        }}
                    >
                        <CloseOutlined style={{ marginRight: '5px' }} />
                        返回
                    </span>
                </Space>
            </div>
        );
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

    const renderComparisonCards = () => {
        if (!showResults) return null;

        const cardWidth = 400;

        const filteredData = originalData.filter(item => {
            const optimizedItem = optimizedData.find(opt => opt.id === item.id);
            return optimizedItem &&
                !optimizedItem.notImprove &&
                !optimizedItem.replaced &&
                optimizedItem.text.trim() !== item.text.trim();
        });

        if (filteredData.length === 0) {
            return (
                <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                    <Card style={{ maxWidth: '500px', margin: '0 auto', borderLeft: '3px solid #1890ff' }}>
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <p>{replacedItems.size > 0 ? '所有内容已成功替换' : '没有需要优化的内容或优化内容与原内容相同'}</p>
                            <span
                                style={{ 
                                    cursor: 'pointer', 
                                    color: '#999',
                                    fontSize: '15px',
                                    marginTop: '15px',
                                    display: 'inline-block'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    restoreAllOriginalStyles();
                                    setActiveCardId(null);
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

        return (
            <div style={{ marginTop: '20px', width: '100%', height: '100vh' }}>
                <Collapse
                    ghost
                    defaultActiveKey={['1']} 
                    style={{ backgroundColor: '#f0f2f5', marginBottom: '20px' }}
                    expandIconPosition="end"
                >
                    <Collapse.Panel 
                        key="1" 
                        header={`全部 (${filteredData.length})`}
                        style={{ textAlign: 'start' }}
                    >
                        <Row gutter={[5, 5]} justify="start">
                            {filteredData.map((item, index) => {
                                const optimizedItem = optimizedData.find(opt => opt.id === item.id);
                                if (!optimizedItem || optimizedItem.notImprove) return null;

                                // 使用deepseek返回的diff数据生成差异摘要
                                const { changesSummary } = renderDiffChanges(optimizedItem.diff);
                                
                                // 如果没有diff数据，回退到前端计算差异
                                const diffDisplay = changesSummary || highlightTextChanges(item.text, optimizedItem.text).changesSummary;
                                
                                const isActive = activeCardId === item.id;

                                return (
                                    <Col xs={24} sm={12} md={8} key={item.id} style={{
                                        marginBottom: '8px',
                                        display: 'flex',
                                        justifyContent: 'center'
                                    }}>
                                        <Card
                                            ref={el => cardRefs.current[item.id] = el}
                                            bordered={true}
                                            style={{
                                                width: cardWidth,
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
                                            onClick={() => handleLocateInDocument(item.id)}
                                        >
                                            <div style={{ 
                                                flex: 1, 
                                                display: 'flex', 
                                                flexDirection: 'column',
                                                width: '100%',
                                                overflow: 'hidden'
                                            }}>
                                                {diffDisplay && (
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
                                                            dangerouslySetInnerHTML={{ __html: diffDisplay }}
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
                                                            color: replacedItems.has(item.id) ? '#999' : '#bbc6ce',
                                                            padding: '8px',
                                                            background: '#f0f8ff',
                                                            borderRadius: '4px',
                                                            marginBottom: '16px',
                                                            textDecoration: replacedItems.has(item.id) ? 'line-through' : 'none',
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
                                                            handleReplaceItem(item, optimizedItem);
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
                                                            if (activeCardId === item.id) {
                                                                restoreOriginalStyle(item.id);
                                                                setActiveCardId(null);
                                                                originalStylesMap.current.delete(item.id);
                                                            }
                                                            const newOptimizedData = [...optimizedData];
                                                            const itemIndex = newOptimizedData.findIndex(opt => opt.id === item.id);
                                                            if (itemIndex !== -1) {
                                                                newOptimizedData[itemIndex] = {...newOptimizedData[itemIndex], replaced: true};
                                                                setOptimizedData(newOptimizedData);
                                                            }
                                                            setReplacedItems(prev => {
                                                                const newSet = new Set(prev);
                                                                newSet.add(item.id);
                                                                return newSet;
                                                            });
                                                        }}
                                                    >
                                                        <CloseOutlined style={{ marginRight: '3px' }} />
                                                        忽略
                                                    </span>
                                                </div>
                                            </div>
                                        </Card>
                                    </Col>
                                );
                            })}
                        </Row>
                    </Collapse.Panel>
                </Collapse>

                {renderActionButtons()}
            </div>
        );
    };

    useEffect(() => {
        if (activeCardId === null && previousActiveCardId.current) {
            restoreOriginalStyle(previousActiveCardId.current);
        }
        previousActiveCardId.current = activeCardId;
    }, [activeCardId]);

    useEffect(() => {
            handleStartProcess();
    }, []);

    // 监听文档名称变化
    useEffect(() => {
        const checkDocumentName = () => {
            if (isWordDocument()) {
                const currentDocName = window._Application.ActiveDocument?.Name;
                if (activeDocumentName !== currentDocName) {
                    setActiveDocumentName(currentDocName);
                    if (activeDocumentName !== null) { // 不是首次设置才重新处理
                        handleStartProcess();
                    }
                }
            }
        };

        // 初始设置文档名
        if (isWordDocument()) {
            setActiveDocumentName(window._Application.ActiveDocument?.Name);
        }

        // 设置定时检查
        const intervalId = setInterval(checkDocumentName, 1000);
        
        return () => {
            clearInterval(intervalId);
        };
    }, [activeDocumentName]);

    return (
        <div style={{ padding: '5px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f0f2f5', color: '#333' }}>
            {loading ? (
                <div style={{ width: '100%', maxWidth: '500px', textAlign: 'center', color: '#333' }}>
                    {processingStatus && <p style={{ marginBottom: '20px', color: '#333' }}>{processingStatus}</p>}
                    <Spin size="large" />
                </div>
            ) : showResults ? (
                renderComparisonCards()
            ) : null}
        </div>
    );
};

export default ArticleOptimizationPage; 