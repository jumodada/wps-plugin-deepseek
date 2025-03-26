import { useState, useRef, useEffect } from 'react';
import { message, Card, Row, Col, Space, Tooltip, Spin, Collapse } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { submitOptimization } from '../api/deepseek';
import { usePageReset } from '../hooks';

const extractParagraphsFromDocument = (): { id: string, text: string }[] => {
    const result: { id: string, text: string }[] = [];
    const document = window._Application.ActiveDocument;
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
    return !!window._Application.ActiveDocument;
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
        notImprove?: boolean 
    }[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [replacedItems, setReplacedItems] = useState<Set<string>>(new Set());
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

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
            const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
            for (let i = 1; i <= paragraphCount; i++) {
                const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
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


    const handleStartProcess = async () => {
        cancelTokenRef.current = new AbortController();
        processingRef.current = true;

        setLoading(true);

        if (!isWordDocument()) {
            message.warning('无法访问Word文档，请确保文档已打开');
            setLoading(false);
            return;
        }

        setProcessingStatus('正在提取文档段落内容...');
        const structuredData = extractParagraphsFromDocument();

        if (structuredData.length === 0) {
            message.warning('无法从文档中提取有效内容');
            setLoading(false);
            return;
        }

        setOriginalData(structuredData);
        setProcessingStatus(`正在处理文档内容...`);

        const formatInstruction = '，保持原意和格式';
        const structuredInputJSON = JSON.stringify(structuredData);

        const params = {
            messages: [
                {
                    role: "system",
                    content: `你是一个专业的文章优化助手。请仅对文本进行词语替换和优化，不要添加大量新文本。对于数组中的第一个元素（如果存在），视为标题，不要增加其字数。如果判断某段文本不需要优化，请滤除这一条。${formatInstruction}`
                },
                {
                    role: "user",
                    content: `请对以下JSON格式的文章内容进行优化，返回优化后的JSON格式内容, 如果判断某段文本不需要优化，请在JSON数据里面滤除这条。只做词语的替换和优化，不要添加额外的大量文本：\n\n${structuredInputJSON}`
                }
            ],
            model: "deepseek-reasoner",
            signal: cancelTokenRef.current?.signal
        };

        const response = await retryOptimization(params);

        if (processingRef.current && response.data && response.data.choices && response.data.choices.length > 0) {
            const result = response.data.choices[0].message.content;

            const jsonMatch = result.match(/(\[.*\])/s);
            const jsonStr = jsonMatch ? jsonMatch[1] : result;

            const resultData = JSON.parse(jsonStr);

            if (Array.isArray(resultData)) {
                const processedData = resultData.map(item => ({
                    ...item,
                    text: item.text.replace(/\r$/, '')
                }));
                setOptimizedData(processedData);
            } else {
                const resultBlocks = result.split(/\n\s*\n/);
                const parsedData: { id: string, text: string, notImprove?: boolean }[] = [];

                for (const block of resultBlocks) {
                    const idMatch = block.match(/ID:\s*([^\n]+)/);
                    const contentMatch = block.match(/内容:\s*([\s\S]+)$/);
                    const notImproveMatch = block.match(/不需要优化/i) || block.match(/保持原样/i);

                    if (idMatch && contentMatch) {
                        const id = idMatch[1].trim();
                        const optimizedText = contentMatch[1].trim().replace(/\r$/, '');

                        parsedData.push({
                            id,
                            text: optimizedText,
                            notImprove: !!notImproveMatch
                        });
                    }
                }

                if (parsedData.length > 0) {
                    setOptimizedData(parsedData);
                } else {
                    setOptimizedData(structuredData.map(item => ({ ...item, notImprove: true })));
                    message.warning('无法解析优化结果，将显示原始内容');
                }
            }

            setShowResults(true);
            setLoading(false);
            message.success('处理完成！请查看优化结果并选择是否替换。');
        } else {
            setLoading(false);
            message.error('处理失败，请重试');
        }
    };

    const handleReplaceItem = (originalItem: { id: string, text: string }, optimizedItem: { id: string, text: string }) => {
        if (activeCardId) {
            restoreOriginalStyle(activeCardId);
            originalStylesMap.current.delete(activeCardId);
        }
        setActiveCardId(null);
        
        const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
        let replaced = false;

        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
            if (paragraph.ParaID === originalItem.id) {
                const originalStyle = {...paragraph.Style};
                const originalFont = {...paragraph.Style.Font};
                const originalParagraphFormat = {...paragraph.Range.ParagraphFormat};
                const CharacterUnitFirstLineIndent = paragraph.Range.ParagraphFormat.CharacterUnitFirstLineIndent;
                const CharacterUnitLeftIndent = paragraph.Range.ParagraphFormat.CharacterUnitLeftIndent;
                const firstLineIndent = paragraph.Range.ParagraphFormat.FirstLineIndent;
                let newText = optimizedItem.text;
                if (!newText.endsWith('\r')) {
                    newText = newText + '\r';
                }
                paragraph.Range.Text = newText;
                paragraph.Style = originalStyle;
                paragraph.Style.Font = originalFont;
                paragraph.Range.ParagraphFormat.CharacterUnitFirstLineIndent = CharacterUnitFirstLineIndent;
                paragraph.Range.ParagraphFormat.CharacterUnitLeftIndent = CharacterUnitLeftIndent;
                paragraph.Range.ParagraphFormat.FirstLineIndent = firstLineIndent;
                paragraph.Range.ParagraphFormat = originalParagraphFormat;
                replaced = true;
                break;
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
        
        const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
        let found = false;

        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
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

    // 创建一个函数来高亮显示文本中的变化
    const highlightTextChanges = (originalText: string, optimizedText: string) => {
        const cleanOriginalText = originalText.replace(/\r/g, '');
        const cleanOptimizedText = optimizedText.replace(/\r/g, '');

        const splitIntoTokens = (text: string) => {
            return text.split(/([,.!?;:""''（）、。，！？；：\s]+)/).filter(Boolean);
        };

        const originalTokens = splitIntoTokens(cleanOriginalText);
        const optimizedTokens = splitIntoTokens(cleanOptimizedText);

        const findCommonSubsequence = (arr1: string[], arr2: string[]) => {
            const lcs = Array(arr1.length + 1).fill(null).map(() =>
                Array(arr2.length + 1).fill(0)
            );

            for (let i = 1; i <= arr1.length; i++) {
                for (let j = 1; j <= arr2.length; j++) {
                    if (arr1[i - 1] === arr2[j - 1]) {
                        lcs[i][j] = lcs[i - 1][j - 1] + 1;
                    } else {
                        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
                    }
                }
            }

            const changes: { original: number, optimized: number }[] = [];
            let i = arr1.length, j = arr2.length;

            while (i > 0 && j > 0) {
                if (arr1[i - 1] === arr2[j - 1]) {
                    i--; j--;
                } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
                    changes.push({ original: i - 1, optimized: -1 });
                    i--;
                } else {
                    changes.push({ original: -1, optimized: j - 1 });
                    j--;
                }
            }

            while (i > 0) {
                changes.push({ original: i - 1, optimized: -1 });
                i--;
            }

            while (j > 0) {
                changes.push({ original: -1, optimized: j - 1 });
                j--;
            }

            return changes.reverse();
        };

        const changes = findCommonSubsequence(originalTokens, optimizedTokens);

        let result = '';

        for (let i = 0; i < optimizedTokens.length; i++) {
            const token = optimizedTokens[i];
            if (changes.some(c => c.optimized === i && c.original === -1)) {
                result += `<span style="color: #FF8080; font-weight: bold;">${token}</span>`;
            } else if (changes.some(c => c.optimized === i && c.original !== -1)) {
                result += `<span style="color: #FF8080; font-weight: bold;">${token}</span>`;
            } else {
                result += token;
            }
        }

        return result;
    };

    const renderComparisonCards = () => {
        if (!showResults) return null;

        const cardWidth = 400;

        const filteredData = originalData.filter(item => {
            const optimizedItem = optimizedData.find(opt => opt.id === item.id);
            return optimizedItem &&
                !optimizedItem.notImprove &&
                optimizedItem.text.trim() !== item.text.trim() &&
                !replacedItems.has(item.id);
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

                                const highlightedText = highlightTextChanges(item.text, optimizedItem.text);
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
                                                borderLeft: '3px solid #1890ff'
                                            }}
                                            bodyStyle={{
                                                padding: '12px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                background: isActive ? '#f0f8ff' : ''
                                            }}
                                            hoverable
                                            onClick={() => handleLocateInDocument(item.id)}
                                        >
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                <Tooltip title={optimizedItem.text} placement="topLeft" color="#fff" overlayInnerStyle={{ color: '#333' }}>
                                                    <div
                                                        style={{
                                                            maxHeight: '200px',
                                                            overflow: 'auto',
                                                            color: replacedItems.has(item.id) ? '#999' : '#bbc6ce',
                                                            padding: '8px',
                                                            background: '#f0f8ff',
                                                            borderRadius: '4px',
                                                            marginBottom: '16px',
                                                            textDecoration: replacedItems.has(item.id) ? 'line-through' : 'none'
                                                        }}
                                                        dangerouslySetInnerHTML={{ __html: highlightedText }}
                                                    />
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
        if(optimizedData.length === 0 && !loading) {
        handleStartProcess();
        }
    }, []);

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