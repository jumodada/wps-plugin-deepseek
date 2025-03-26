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
import { generateDiffAnalysis } from '../api/deepseek';
import { usePageReset } from '../hooks';

// 添加优化的差异检测函数
const highlightTextDifferences = (originalText: string, optimizedText: string) => {
    const cleanOriginalText = originalText.replace(/\r/g, '');
    const cleanOptimizedText = optimizedText.replace(/\r/g, '');

    // 首先比较完整文本，检查是否相似度很高
    const isSimilarText = (s1: string, s2: string): boolean => {
        // 如果长度差异过大，则认为不相似
        if (Math.abs(s1.length - s2.length) > Math.min(s1.length, s2.length) * 0.5) {
            return false;
        }
        
        // 计算相同字符的数量
        let sameChars = 0;
        for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
            if (s1[i] === s2[i]) sameChars++;
        }
        
        // 如果有超过70%的字符相同，则认为相似
        return sameChars / Math.max(s1.length, s2.length) > 0.7;
    };
    
    // 查找共同前缀和后缀，优化相似文本的差异展示
    const findCommonBoundaries = (s1: string, s2: string): { prefix: string, s1Core: string, s2Core: string, suffix: string } => {
        // 找共同前缀
        let prefixLength = 0;
        while (prefixLength < Math.min(s1.length, s2.length) && s1[prefixLength] === s2[prefixLength]) {
            prefixLength++;
        }
        
        // 找共同后缀
        let suffixLength = 0;
        while (
            suffixLength < Math.min(s1.length - prefixLength, s2.length - prefixLength) &&
            s1[s1.length - 1 - suffixLength] === s2[s2.length - 1 - suffixLength]
        ) {
            suffixLength++;
        }
        
        // 提取核心差异部分
        const prefix = s1.substring(0, prefixLength);
        const s1Core = s1.substring(prefixLength, s1.length - suffixLength);
        const s2Core = s2.substring(prefixLength, s2.length - suffixLength);
        const suffix = s1.substring(s1.length - suffixLength);
        
        return { prefix, s1Core, s2Core, suffix };
    };

    // 中文分词函数 - 基础实现，按1-4个字符的长度划分可能的词语
    const segmentChinese = (text: string): string[] => {
        const words: string[] = [];
        let startIdx = 0;
        
        // 简单的汉字、数字、字母识别正则
        const charTypePattern = /[\u4e00-\u9fa5]|[0-9]|[a-zA-Z]/;
        
        while (startIdx < text.length) {
            // 如果是标点或空格，作为单独的token
            if (!charTypePattern.test(text[startIdx])) {
                words.push(text[startIdx]);
                startIdx++;
                continue;
            }
            
            // 尝试找最长的连续同类型字符作为词语
            let endIdx = startIdx + 1;
            const charType = text[startIdx].match(/[\u4e00-\u9fa5]/) ? 'chinese' : 
                             text[startIdx].match(/[0-9]/) ? 'digit' : 'letter';
            
            while (endIdx < text.length) {
                const currentCharType = text[endIdx].match(/[\u4e00-\u9fa5]/) ? 'chinese' : 
                                       text[endIdx].match(/[0-9]/) ? 'digit' : 
                                       text[endIdx].match(/[a-zA-Z]/) ? 'letter' : 'other';
                
                if (currentCharType !== charType) break;
                
                // 对于汉字，最多取4个字符为一个词语
                // 对于数字和字母，可以继续连接
                if (charType === 'chinese' && endIdx - startIdx >= 3) break;
                
                endIdx++;
            }
            
            words.push(text.substring(startIdx, endIdx));
            startIdx = endIdx;
        }
        
        return words;
    };
    
    // 词语级别的差异比较
    const compareWords = (s1Core: string, s2Core: string): { 
        replacements: { original: string, optimized: string }[],
        deletions: string[],
        additions: string[]
    } => {
        // 分词
        const words1 = segmentChinese(s1Core);
        const words2 = segmentChinese(s2Core);
        
        // 查找最长公共子序列
        const lcsTable = Array(words1.length + 1).fill(null).map(() => 
            Array(words2.length + 1).fill(0)
        );
        
        for (let i = 1; i <= words1.length; i++) {
            for (let j = 1; j <= words2.length; j++) {
                if (words1[i - 1] === words2[j - 1]) {
                    lcsTable[i][j] = lcsTable[i - 1][j - 1] + 1;
                } else {
                    lcsTable[i][j] = Math.max(lcsTable[i - 1][j], lcsTable[i][j - 1]);
                }
            }
        }
        
        // 从LCS表中提取操作序列
        const operations: { type: 'match' | 'delete' | 'add', word: string }[] = [];
        let i = words1.length, j = words2.length;
        
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) {
                operations.unshift({ type: 'match', word: words1[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || lcsTable[i][j - 1] >= lcsTable[i - 1][j])) {
                operations.unshift({ type: 'add', word: words2[j - 1] });
                j--;
            } else {
                operations.unshift({ type: 'delete', word: words1[i - 1] });
                i--;
            }
        }
        
        // 分析操作序列，识别替换
        const result = {
            replacements: [] as { original: string, optimized: string }[],
            deletions: [] as string[],
            additions: [] as string[]
        };
        
        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            
            if (op.type === 'delete' && i + 1 < operations.length && operations[i + 1].type === 'add') {
                // 识别为替换
                result.replacements.push({
                    original: op.word,
                    optimized: operations[i + 1].word
                });
                i++; // 跳过下一个add操作
            } else if (op.type === 'delete') {
                result.deletions.push(op.word);
            } else if (op.type === 'add') {
                result.additions.push(op.word);
            }
        }
        
        return result;
    };
    
    // 尝试直接识别简单模式的变化，如"直播间配置"到"直播间设置"
    if (isSimilarText(cleanOriginalText, cleanOptimizedText)) {
        const { prefix, s1Core, s2Core, suffix } = findCommonBoundaries(cleanOriginalText, cleanOptimizedText);
        
        // 如果发现了明确的前缀和后缀，并且核心差异部分较小，直接显示简单替换
        if ((prefix.length > 0 || suffix.length > 0) && s1Core.length <= 10 && s2Core.length <= 10) {
            // 这里直接返回简单的差异展示
            const changesSummary = `<span style="color: #FF8080; text-decoration: line-through;">${s1Core}</span> → <span style="color: #52c41a;">${s2Core}</span>`;
            
            return { changesSummary };
        }
        // 差异较大但仍有明确前后缀，尝试词语级别比较
        else if (prefix.length > 0 || suffix.length > 0) {
            const wordComparison = compareWords(s1Core, s2Core);
            
            // 如果有明确的词语替换模式，使用词语级别的展示
            if (wordComparison.replacements.length > 0 || 
                wordComparison.deletions.length > 0 || 
                wordComparison.additions.length > 0) {
                
                // 生成变化摘要
                let changesSummary = '';
                
                // 处理替换
                if (wordComparison.replacements.length > 0) {
                    const replaceItems = wordComparison.replacements.map(r => 
                        `<span style="color: #FF8080; text-decoration: line-through;">${r.original}</span> → <span style="color: #52c41a;">${r.optimized}</span>`
                    );
                    changesSummary += replaceItems.join(', ');
                }
                
                // 处理删除
                if (wordComparison.deletions.length > 0) {
                    if (changesSummary) changesSummary += ' | ';
                    const deleteItems = wordComparison.deletions.map(d => 
                        `<span style="color: #FF8080; text-decoration: line-through;">${d}</span>`
                    );
                    changesSummary += deleteItems.join(', ');
                }
                
                // 处理新增
                if (wordComparison.additions.length > 0) {
                    if (changesSummary) changesSummary += ' | ';
                    const addItems = wordComparison.additions.map(a => 
                        `<span style="color: #52c41a;"><PlusOutlined style="fontSize: 10px"/> ${a}</span>`
                    );
                    changesSummary += addItems.join(', ');
                }
                
                return { changesSummary };
            }
        }
    }

    // 如果不是简单模式，使用详细的字符级别差异检测
    // 使用更小的粒度进行拆分，能捕获单个字符级别的变化
    const getTokens = (text: string) => {
        // 先按照标点符号和空格拆分，然后对每个词进一步拆分为字符
        const words = text.split(/([,.!?;:""''（）、。，！？；：\s]+)/);
        const tokens: { text: string, isDelimiter: boolean, index: number }[] = [];
        let globalIndex = 0;
        
        words.forEach(word => {
            if (!word) return;
            
            const isDelimiter = /^[,.!?;:""''（）、。，！？；：\s]+$/.test(word);
            
            if (isDelimiter) {
                tokens.push({ text: word, isDelimiter: true, index: globalIndex });
                globalIndex += word.length;
            } else {
                // 对普通词再拆分为单个字符
                for (let i = 0; i < word.length; i++) {
                    tokens.push({ text: word[i], isDelimiter: false, index: globalIndex });
                    globalIndex++;
                }
            }
        });
        
        return tokens;
    };

    const originalTokens = getTokens(cleanOriginalText);
    const optimizedTokens = getTokens(cleanOptimizedText);

    // 使用Myers差分算法找出最小编辑序列
    const computeDiff = (a: typeof originalTokens, b: typeof optimizedTokens) => {
        const MAX = a.length + b.length;
        const v = new Array(2 * MAX + 1).fill(0);
        const trace: number[][] = [];
        
        let x, y;
        const findPath = () => {
            for (let d = 0; d <= MAX; d++) {
                trace.push([...v]);
                
                for (let k = -d; k <= d; k += 2) {
                    if (k === -d || (k !== d && v[k-1+MAX] < v[k+1+MAX])) {
                        x = v[k+1+MAX];
                    } else {
                        x = v[k-1+MAX] + 1;
                    }
                    
                    y = x - k;
                    
                    while (x < a.length && y < b.length && 
                           a[x].text === b[y].text && 
                           a[x].isDelimiter === b[y].isDelimiter) {
                        x++;
                        y++;
                    }
                    
                    v[k+MAX] = x;
                    
                    if (x >= a.length && y >= b.length) {
                        return d;
                    }
                }
            }
            return -1;
        };
        
        const d = findPath();
        
        // 构建编辑脚本
        const backtrack = (x: number, y: number, d: number, edits: { op: string, aIndex?: number, bIndex?: number }[]) => {
            if (d === 0) return;
            
            const k = x - y;
            const kPrev = trace[d-1][k+MAX];
            
            let prevK;
            if (k === -d || (k !== d && trace[d-1][k-1+MAX] < trace[d-1][k+1+MAX])) {
                prevK = k + 1;
            } else {
                prevK = k - 1;
            }
            
            const prevX = trace[d-1][prevK+MAX];
            const prevY = prevX - prevK;
            
            // 先递归处理前面的部分
            backtrack(prevX, prevY, d-1, edits);
            
            if (prevK > k) {
                // 插入操作 (来自B但不在A中)
                edits.push({ op: 'add', bIndex: prevY });
            } else if (prevK < k) {
                // 删除操作 (在A中但不在B中)
                edits.push({ op: 'del', aIndex: prevX });
            } else {
                // 匹配操作
                for (let i = prevX; i < x; i++) {
                    edits.push({ op: 'match', aIndex: i, bIndex: prevY + (i - prevX) });
                }
            }
        };
        
        const edits: { op: string, aIndex?: number, bIndex?: number }[] = [];
        backtrack(a.length, b.length, d, edits);
        
        return edits;
    };

    const edits = computeDiff(originalTokens, optimizedTokens);
    
    // 处理编辑脚本，识别出替换、删除和新增
    const replacementGroups: {
        original: string, 
        optimized: string, 
        origIndexes: number[],
        optIndexes: number[]
    }[] = [];
    
    let currentReplacement: {
        original: string, 
        optimized: string,
        origIndexes: number[],
        optIndexes: number[]
    } | null = null;

    // 根据编辑脚本生成差异信息
    const deletions: { text: string, index: number }[] = [];
    const additions: { text: string, index: number }[] = [];

    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        
        if (edit.op === 'del') {
            const token = originalTokens[edit.aIndex!];
            if (!token.isDelimiter) {
                deletions.push({ text: token.text, index: token.index });
                
                // 查看下一个操作是否是添加，如果是则可能是替换
                if (i + 1 < edits.length && edits[i+1].op === 'add') {
                    const nextToken = optimizedTokens[edits[i+1].bIndex!];
                    if (!nextToken.isDelimiter) {
                        if (currentReplacement === null) {
                            currentReplacement = {
                                original: token.text,
                                optimized: nextToken.text,
                                origIndexes: [token.index],
                                optIndexes: [nextToken.index]
                            };
                        } else {
                            currentReplacement.original += token.text;
                            currentReplacement.origIndexes.push(token.index);
                        }
                        i++; // 跳过下一个add操作
                        currentReplacement.optimized += nextToken.text;
                        currentReplacement.optIndexes.push(nextToken.index);
                    }
                } else if (currentReplacement !== null) {
                    // 如果正在构建替换组，将当前删除添加到组中
                    currentReplacement.original += token.text;
                    currentReplacement.origIndexes.push(token.index);
                }
            } else if (currentReplacement !== null) {
                // 如果是分隔符且有正在构建的替换组，完成该组
                replacementGroups.push(currentReplacement);
                currentReplacement = null;
            }
        } else if (edit.op === 'add') {
            const token = optimizedTokens[edit.bIndex!];
            if (!token.isDelimiter) {
                if (currentReplacement === null) {
                    additions.push({ text: token.text, index: token.index });
                } else {
                    currentReplacement.optimized += token.text;
                    currentReplacement.optIndexes.push(token.index);
                }
            } else if (currentReplacement !== null) {
                // 如果是分隔符且有正在构建的替换组，完成该组
                replacementGroups.push(currentReplacement);
                currentReplacement = null;
            }
        } else if (edit.op === 'match') {
            if (currentReplacement !== null) {
                // 如果有正在构建的替换组，完成该组
                replacementGroups.push(currentReplacement);
                currentReplacement = null;
            }
        }
    }

    // 处理最后一个替换组
    if (currentReplacement !== null) {
        replacementGroups.push(currentReplacement);
    }

    // 合并相邻的相同类型操作
    const mergeAdjacentOperations = <T extends { text: string, index: number }>(operations: T[]): T[] => {
        if (operations.length <= 1) return operations;
        
        const result: T[] = [];
        let current = { ...operations[0] };
        
        for (let i = 1; i < operations.length; i++) {
            // 如果当前操作和前一个操作的索引连续，则合并
            if (operations[i].index === current.index + current.text.length) {
                current.text += operations[i].text;
            } else {
                result.push(current);
                current = { ...operations[i] };
            }
        }
        
        result.push(current);
        return result;
    };

    // 合并操作
    const mergedDeletions = mergeAdjacentOperations(deletions);
    const mergedAdditions = mergeAdjacentOperations(additions);

    // 生成变化摘要
    let changesSummary = '';
    
    // 处理替换操作
    if (replacementGroups.length > 0) {
        const replaceItems = replacementGroups.map(r => 
            `<span style="color: #FF8080; text-decoration: line-through;">${r.original}</span> → <span style="color: #52c41a;">${r.optimized}</span>`
        );
        changesSummary += replaceItems.join(', ');
    }
    
    // 处理删除操作
    if (mergedDeletions.length > 0) {
        if (changesSummary) changesSummary += ' | ';
        const deleteItems = mergedDeletions.map(d => 
            `<span style="color: #FF8080; text-decoration: line-through;">${d.text}</span>`
        );
        changesSummary += deleteItems.join(', ');
    }
    
    // 处理新增操作
    if (mergedAdditions.length > 0) {
        if (changesSummary) changesSummary += ' | ';
        const addItems = mergedAdditions.map(a => 
            `<span style="color: #52c41a;"><PlusOutlined style="fontSize: 10px"/> ${a.text}</span>`
        );
        changesSummary += addItems.join(', ');
    }

    return { changesSummary };
};

const SelectionOptimizationPage = () => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState('');
    const [originalItem, setOriginalItem] = useState<{ id: string, text: string } | null>(null);
    const [optimizedItem, setOptimizedItem] = useState<{ id: string, text: string, diff?: string[] } | null>(null);
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
                // 第一步：进行文本优化
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
                
                setProgress(40);
                
                // 发送第一次请求
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
                        setProgress(100);
                        setShowResults(true);
                        message.info('文本无需优化，内容已保持原样');
                        setLoading(false);
                        return;
                    }
                    
                    // 第二步：获取差异分析
                    setProcessingStatus('正在分析文本差异...');
                    setProgress(70);
                    
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
                    } catch (error: any) {
                        // 差异分析失败，仍然返回优化结果
                        console.error('差异分析失败:', error);
                        setOptimizedItem({
                            id: selectedText.id,
                            text: optimizedText,
                            diff: []
                        });
                    }
                    
                    setProgress(100);
                    setShowResults(true);
                    message.success('内容优化完成！');
                } else {
                    message.error('获取优化结果失败');
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
    
    // 添加renderDiffChanges函数，用于展示deepseek返回的diff数据
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
        
        if (originalItem.text.trim() === optimizedItem.text.trim()) {
            return (
                <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                    <Card style={{ maxWidth: '500px', margin: '0 auto', borderLeft: '3px solid #1890ff' }}>
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
        
        // 获取变化摘要，优先使用deepseek返回的diff数据
        const { changesSummary } = optimizedItem.diff 
            ? renderDiffChanges(optimizedItem.diff) 
            : highlightTextDifferences(originalItem.text, optimizedItem.text);
        
        // 定义卡片宽度
        const cardWidth = 500;
        
        return (
            <div style={{ marginTop: '20px', width: '100%', textAlign: 'center' }}>
                <h2 style={{ color: '#333', textAlign: 'center', marginBottom: '20px' }}>优化结果对比</h2>
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
                        animation: 'fadeInUp 0.5s ease',
                        borderLeft: '3px solid #1890ff',
                        overflow: 'hidden'
                    }}
                    bodyStyle={{
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        background: isActive ? '#f0f8ff' : '',
                        width: '100%',
                        overflow: 'hidden'
                    }}
                    hoverable
                    onClick={handleLocateInDocument}
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
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '12px',
                            width: '100%'
                        }}>
                            <h4 style={{ margin: 0 }}>原始内容:</h4>
                            <Tooltip title="定位到文档">
                                <AimOutlined style={{ color: isActive ? '#1890ff' : '#52c41a' }} />
                            </Tooltip>
                        </div>
                        <Tooltip 
                            title={originalItem.text} 
                            placement="topLeft" 
                            color="#fff" 
                            overlayInnerStyle={{ color: '#333', maxWidth: '400px', maxHeight: '300px', overflow: 'auto' }}
                            mouseEnterDelay={0.5}
                        >
                            <div style={{ 
                                maxHeight: '150px', 
                                overflow: 'hidden',
                                marginBottom: '16px',
                                padding: '12px',
                                background: '#f9f9f9',
                                borderRadius: '4px',
                                width: '100%'
                            }}>
                                <div style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 4,
                                    WebkitBoxOrient: 'vertical',
                                    wordBreak: 'break-word',
                                    wordWrap: 'break-word'
                                }}>
                                    {originalItem.text}
                                </div>
                            </div>
                        </Tooltip>
                        
                        <h4>优化后内容:</h4>
                        <Tooltip 
                            title={optimizedItem.text} 
                            placement="topLeft" 
                            color="#fff" 
                            overlayInnerStyle={{ color: '#333', maxWidth: '400px', maxHeight: '300px', overflow: 'auto' }}
                            mouseEnterDelay={0.5}
                        >
                            <div style={{ 
                                maxHeight: '150px', 
                                overflow: 'hidden',
                                color: '#1890ff', 
                                padding: '12px',
                                background: '#f0f8ff',
                                borderRadius: '4px',
                                marginBottom: '16px',
                                width: '100%'
                            }}>
                                <div style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 4,
                                    WebkitBoxOrient: 'vertical',
                                    wordBreak: 'break-word',
                                    wordWrap: 'break-word'
                                }}>
                                    {optimizedItem.text}
                                </div>
                            </div>
                        </Tooltip>
                        
                        <div style={{ textAlign: 'left', marginTop: 'auto' }}>
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
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f0f2f5', color: '#333' }}>
            {loading ? (
                <div style={{ width: '80%', maxWidth: '500px', textAlign: 'center', color: '#333' }}>
                    {processingStatus && <p style={{ marginBottom: '20px', color: '#333' }}>{processingStatus}</p>}
                    <Progress 
                        type="circle"
                        percent={progress} 
                        status="active" 
                        style={{ marginBottom: '20px' }} 
                        strokeColor={{
                            '0%': '#108ee9',
                            '100%': '#87d068',
                        }}
                        trailColor="rgba(0,0,0,0.1)"
                        format={percent => <span style={{ color: '#333' }}>{percent}%</span>}
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