import { useState, useRef, useEffect } from 'react';
import { Button, message, Progress, Card, Row, Col, Space, Tooltip } from 'antd';
import { StopOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { submitOptimization } from '../api/deepseek';
import { usePageReset } from '../hooks';

// 添加CSS动画样式
const fadeOutAnimation = {
    '@keyframes fadeOut': {
        '0%': { opacity: 1, transform: 'translateY(0)' },
        '100%': { opacity: 0, transform: 'translateY(-20px)' }
    },
    '@keyframes fadeInUp': {
        '0%': { opacity: 0, transform: 'translateY(20px)' },
        '100%': { opacity: 1, transform: 'translateY(0)' }
    }
};

// 将动画样式插入到文档中
const injectStyles = () => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        @keyframes fadeOut {
            0% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes fadeInUp {
            0% { opacity: 0; transform: translateY(20px); }
            100% { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styleEl);
};

const extractParagraphsFromDocument = (): { id: string, text: string }[] => {
    try {
        const result: { id: string, text: string }[] = [];

        // 使用paragraph.Item()遍历方式获取文档段落
        const document = window._Application.ActiveDocument;
        const paragraphCount = document.Paragraphs.Count;

        for (let i = 1; i <= paragraphCount; i++) {
            try {
                const paragraph = document.Paragraphs.Item(i);
                // 获取段落ID
                const paraId = paragraph.ParaID;
                // 不使用trim()，保留原始格式包括行尾的\r
                const text = paragraph.Range.Text;

                // 只添加有文本内容的段落（使用trim()进行判断，但存储原始文本）
                if (text.trim()) {
                    result.push({
                        id: paraId,
                        text: text
                    });
                }
            } catch (error) {
                console.error(`处理第${i}个段落时出错:`, error);
            }
        }
        return result;
    } catch (error) {
        console.error('获取文档段落时出错:', error);
        return [];
    }
};


const isWordDocument = (): boolean => {
    try {
        return !!window._Application.ActiveDocument;
    } catch (error) {
        return false;
    }
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
    const [progress, setProgress] = useState(0);
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

    // 使用文档切换监听钩子，当文档切换时重置页面状态
    const handleReset = () => {
        // 自定义重置逻辑
        setLoading(false);
        setProgress(0);
        setProcessingStatus('');
        setOriginalData([]);
        setOptimizedData([]);
        setShowResults(false);
        setReplacedItems(new Set());
        setActiveCardId(null);
        
        // 先恢复所有样式，避免样式残留
        restoreAllOriginalStyles();
        
        message.info('文档已切换，页面已重置');
    };
    
    // 应用页面重置钩子
    usePageReset(handleReset);
    
    const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const previousActiveCardId = useRef<string | null>(null);
    // 创建独立的Map来存储原始样式
    const originalStylesMap = useRef<Map<string, { underline: number, color: number }>>(new Map());

    // 注入CSS动画样式
    useEffect(() => {
        injectStyles();
    }, []);

    // 在卸载组件或取消激活状态时恢复原始样式
    useEffect(() => {
        return () => {
            // 组件卸载时恢复样式
            restoreAllOriginalStyles();
        };
    }, []);

    const preserveFormatting = true;


    const cancelTokenRef = useRef<AbortController | null>(null);
    const processingRef = useRef<boolean>(false);

    // 恢复指定段落原始文本样式的函数
    const restoreOriginalStyle = (paragraphId: string) => {
        const originalStyle = originalStylesMap.current.get(paragraphId);
        if (originalStyle) {
            try {
                const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
                for (let i = 1; i <= paragraphCount; i++) {
                    try {
                        const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                        if (paragraph.ParaID === paragraphId) {
                            // 检查并替换9999999值为0
                            const underline = originalStyle.underline === 9999999 ? 0 : originalStyle.underline;
                            const color = originalStyle.color === 9999999 ? 0 : originalStyle.color;
                            
                            paragraph.Range.Font.Underline = underline;
                            paragraph.Range.Font.Color = color;
                            break;
                        }
                    } catch (error) {
                        continue;
                    }
                }
            } catch (error) {
                console.error('恢复原始样式时出错:', error);
            }
        }
    };

    // 恢复所有段落的原始样式
    const restoreAllOriginalStyles = () => {
        // 使用Map的keys()和forEach迭代所有存储的样式
        originalStylesMap.current.forEach((_, paragraphId) => {
            restoreOriginalStyle(paragraphId);
        });
    };

    // 应用高亮样式到所有段落
    const applyHighlightToAllParagraphs = () => {
        try {
            const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;

            for (const item of optimizedData) {
                // 跳过不需要优化的项
                if (item.notImprove) continue;

                for (let j = 1; j <= paragraphCount; j++) {
                    try {
                        const paragraph = window._Application.ActiveDocument.Paragraphs.Item(j);
                        if (paragraph.ParaID === item.id) {
                            // 保存原始样式，处理9999999的情况
                            const underline = paragraph.Range.Font.Underline;
                            const color = paragraph.Range.Font.Color;
                            
                            // 保存到独立的Map中
                            originalStylesMap.current.set(item.id, {
                                underline: underline === 9999999 ? 0 : underline,
                                color: color === 9999999 ? 0 : color
                            });
                            
                            // 应用高亮样式
                            paragraph.Range.Font.Underline = 11; // 设置下划线
                            paragraph.Range.Font.Color = 255;   // 设置颜色为红色
                            break;
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        } catch (error) {
            console.error('应用高亮样式时出错:', error);
        }
    };

    const handleCancel = () => {
        if (cancelTokenRef.current) {
            cancelTokenRef.current.abort();
            cancelTokenRef.current = null;
        }
        processingRef.current = false;
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

            if (structuredData.length === 0) {
                message.warning('无法从文档中提取有效内容');
                setLoading(false);
                return;
            }

            setOriginalData(structuredData);

            // 发送整个数组到DeepSeek进行优化
            setProcessingStatus(`正在处理文档内容...`);

            try {
                const formatInstruction = preserveFormatting ? '，保持原意和格式' : '，保持原意';

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

                setProgress(20); // 设置初始进度

                const response = await retryOptimization(params);

                console.log('DeepSeek响应结构:', JSON.stringify(response.data));

                if (processingRef.current && response.data && response.data.choices && response.data.choices.length > 0) {
                    const result = response.data.choices[0].message.content;

                    try {
                        const jsonMatch = result.match(/(\[.*\])/s);
                        const jsonStr = jsonMatch ? jsonMatch[1] : result;

                        const resultData = JSON.parse(jsonStr);

                        if (Array.isArray(resultData)) {
                            // 确保处理返回的数据，去除可能存在的\r
                            const processedData = resultData.map(item => ({
                                ...item,
                                text: item.text.replace(/\r$/, '') // 移除末尾的\r字符
                            }));
                            setOptimizedData(processedData);
                            setProgress(100);
                        }
                    } catch (parseError) {
                        console.error('解析返回的JSON数据失败:', parseError);
                        console.log('原始返回内容:', result);

                        const resultBlocks = result.split(/\n\s*\n/);
                        const parsedData: { id: string, text: string, notImprove?: boolean }[] = [];

                        for (const block of resultBlocks) {
                            const idMatch = block.match(/ID:\s*([^\n]+)/);
                            const contentMatch = block.match(/内容:\s*([\s\S]+)$/);
                            const notImproveMatch = block.match(/不需要优化/i) || block.match(/保持原样/i);

                            if (idMatch && contentMatch) {
                                const id = idMatch[1].trim();
                                // 去除末尾可能存在的\r
                                const optimizedText = contentMatch[1].trim().replace(/\r$/, '');

                                parsedData.push({
                                    id,
                                    text: optimizedText,
                                    notImprove: notImproveMatch ? true : false
                                });
                            }
                        }

                        if (parsedData.length > 0) {
                            setOptimizedData(parsedData);
                            setProgress(100);
                        } else {
                            // 如果解析失败，将原始数据设为优化数据
                            setOptimizedData(structuredData.map(item => ({ ...item, notImprove: true })));
                            message.warning('无法解析优化结果，将显示原始内容');
                        }
                    }

                    setShowResults(true);
                    message.success('处理完成！请查看优化结果并选择是否替换。');
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    return;
                }

                console.error('处理文档时出错:', error);
                message.error(typeof error === 'object' && error !== null && 'message' in error
                    ? String(error.message)
                    : '请求失败，请检查网络连接或API配置');
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
        // 替换前恢复原始样式
        restoreAllOriginalStyles();
        setActiveCardId(null);
        
        try {
            if (optimizedData.length > 0) {
                for (const item of optimizedData) {
                    try {
                        const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
                        for (let i = 1; i <= paragraphCount; i++) {
                            const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                            try {
                                // 使用paraID进行比对
                                if (paragraph.ParaID === item.id) {
                                    // 确保文本末尾有\r字符，保持原始格式
                                    let newText = item.text;
                                    if (!newText.endsWith('\r')) {
                                        newText = newText + '\r';
                                    }
                                    paragraph.Range.Text = newText;
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
                
                // 清空样式存储Map
                originalStylesMap.current.clear();

                message.success('全部内容已替换完成！');
            } else {
                message.warning('没有可替换的内容');
            }
        } catch (error: any) {
            message.error('替换失败: ' + (error.message || String(error)));
        }
    };

    const handleReplaceItem = (originalItem: { id: string, text: string }, optimizedItem: { id: string, text: string }) => {
        // 替换前恢复原始样式
        if (activeCardId) {
            restoreOriginalStyle(activeCardId);
            // 替换后从样式Map中移除
            originalStylesMap.current.delete(activeCardId);
        }
        setActiveCardId(null);
        
        try {
            const cardElement = cardRefs.current[originalItem.id];
            if (cardElement) {
                cardElement.style.animation = 'fadeOut 0.5s ease forwards';

                const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
                let replaced = false;

                for (let i = 1; i <= paragraphCount; i++) {
                    const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                    try {
                        if (paragraph.ParaID === originalItem.id) {
                            // 保存原始样式
                            const originalStyle = paragraph.Style;
                            const CharacterUnitFirstLineIndent = paragraph.Range.ParagraphFormat.CharacterUnitFirstLineIndent;
                            const CharacterUnitLeftIndent = paragraph.Range.ParagraphFormat.CharacterUnitLeftIndent;
                            const firstLineIndent = paragraph.Range.ParagraphFormat.FirstLineIndent;
                            let newText = optimizedItem.text;
                            if (!newText.endsWith('\r')) {
                                newText = newText + '\r';
                            }
                            paragraph.Range.Text = newText;
                            paragraph.Style = originalStyle;
                            paragraph.Range.ParagraphFormat.CharacterUnitFirstLineIndent = CharacterUnitFirstLineIndent;
                            paragraph.Range.ParagraphFormat.CharacterUnitLeftIndent = CharacterUnitLeftIndent;
                            paragraph.Range.ParagraphFormat.FirstLineIndent = firstLineIndent;
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
                    
                    // 从样式Map中移除已替换的项
                    originalStylesMap.current.delete(originalItem.id);

                    message.success(`已替换内容`);
                } else {
                    message.warning(`未找到原文内容相符的段落`);
                }
            }
        } catch (error: any) {
            message.error('替换失败: ' + (error.message || String(error)));
        }
    };

    const handleLocateInDocument = (paragraphId: string) => {
        try {
            // 如果已有激活的卡片，先恢复其样式并清除激活状态
            if (activeCardId && activeCardId !== paragraphId) {
                // 恢复当前激活卡片的样式
                restoreOriginalStyle(activeCardId);
                setActiveCardId(null);
            }
            
            // 如果点击的是当前激活的卡片，则恢复其样式并取消激活状态
            if (activeCardId === paragraphId) {
                restoreOriginalStyle(paragraphId);
                setActiveCardId(null);
                return;
            }
            
            const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
            let found = false;

            for (let i = 1; i <= paragraphCount; i++) {
                const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
                try {
                    // 使用paraID进行比对
                    if (paragraph.ParaID === paragraphId) {
                        paragraph.Range.Select();
                        found = true;

                        // 保存原始样式
                        const selection = window._Application.Selection;
                        const underlineStyle = selection.Font.Underline === 9999999 ? 0 : selection.Font.Underline;
                        const colorStyle = selection.Font.Color === 9999999 ? 0 : selection.Font.Color;
                        
                        // 保存到独立的Map中
                        originalStylesMap.current.set(paragraphId, {
                            underline: underlineStyle,
                            color: colorStyle
                        });
                        
                        // 设置新样式
                        selection.Font.Underline = 11; // 设置下划线
                        selection.Font.Color = 255;   // 设置颜色为红色
                        
                        // 设置当前激活的卡片ID
                        setActiveCardId(paragraphId);

                        // 滚动到对应的卡片位置
                        if (cardRefs.current[paragraphId]) {
                            cardRefs.current[paragraphId]?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                        }

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
        // 替换全部前恢复活动卡片样式
        if (activeCardId) {
            restoreOriginalStyle(activeCardId);
        }
        setActiveCardId(null);
        // 清空样式Map
        originalStylesMap.current.clear();
        handleReplace();
    };

    const renderActionButtons = () => {
        const allReplaced = optimizedData.length > 0 &&
            optimizedData.every(item => replacedItems.has(item.id));

        return (
            <div style={{ textAlign: 'center', marginTop: '30px' }}>
                <Space size="large">
                    {!allReplaced && (
                        <span
                            style={{ 
                                cursor: 'pointer', 
                                color: '#1890ff',
                                fontSize: '15px'
                            }}
                            onClick={handleReplaceAll}
                        >
                            <CheckOutlined style={{ marginRight: '5px' }} />
                            全部替换
                        </span>
                    )}
                    <span
                        style={{ 
                            cursor: 'pointer', 
                            color: '#999',
                            fontSize: '15px'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            // 取消显示结果前恢复原始样式
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

            // 提取变化
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

        // 生成带有高亮的HTML
        let result = '';

        for (let i = 0; i < optimizedTokens.length; i++) {
            const token = optimizedTokens[i];
            if (changes.some(c => c.optimized === i && c.original === -1)) {
                // 这是一个添加的单词，标红显示
                result += `<span style="color: #FF8080; font-weight: bold;">${token}</span>`;
            } else if (changes.some(c => c.optimized === i && c.original !== -1)) {
                // 这是一个修改的单词，标红显示
                result += `<span style="color: #FF8080; font-weight: bold;">${token}</span>`;
            } else {
                // 未变化的单词
                result += token;
            }
        }

        return result;
    };

    const renderComparisonCards = () => {
        if (!showResults) return null;

        // 定义卡片宽度
        const cardWidth = 400;

        // 过滤数据，只保留有优化内容且不是notImprove的项
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
                    <Card style={{ maxWidth: '500px', margin: '0 auto' }}>
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
                                    // 取消显示结果前恢复原始样式
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
            <div style={{ marginTop: '20px', width: '100%' }}>
                <Row gutter={[16, 16]} justify="center">
                    {filteredData.map((item, index) => {
                        const optimizedItem = optimizedData.find(opt => opt.id === item.id);
                        if (!optimizedItem || optimizedItem.notImprove) return null;

                        // 生成高亮文本
                        const highlightedText = highlightTextChanges(item.text, optimizedItem.text);
                        
                        // 检查当前卡片是否处于激活状态
                        const isActive = activeCardId === item.id;

                        return (
                            <Col xs={24} sm={12} md={8} key={item.id} style={{
                                marginBottom: '16px',
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
                                        animation: 'fadeInUp 0.5s ease'
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

                                        <div style={{ textAlign: 'center', marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: '15px' }}>
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
                                                        // 从样式Map中移除
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

                {renderActionButtons()}
            </div>
        );
    };

    // 监听activeCardId变化，当变为null时恢复样式
    useEffect(() => {
        if (activeCardId === null && previousActiveCardId.current) {
            restoreOriginalStyle(previousActiveCardId.current);
        }
        previousActiveCardId.current = activeCardId;
    }, [activeCardId]);

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