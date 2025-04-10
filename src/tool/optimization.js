import { submitOptimization, submitWordCorrection, submitStreamOptimizationWithFetch, submitStreamWordCorrection } from '../api/deepseek';

// 检查是否是Word文档
export const isWordDocument = () => {
    try {
        return !!window.Application.ActiveDocument;
    } catch (error) {
        return false;
    }
};

// 提取段落数据
export const extractParagraphsFromDocument = () => {
    try {
        const result = [];
        
        // 使用paragraph.Item()遍历方式获取文档段落
        const document = window.Application.ActiveDocument;
        const paragraphCount = document.Paragraphs.Count;
        
        for (let i = 1; i <= paragraphCount; i++) {
            try {
                const paragraph = document.Paragraphs.Item(i);
                // 获取段落XML
                const xml = paragraph.Range.WordOpenXML;
                
                // 解析XML
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xml, "text/xml");
                
                // 获取所有w:t标签
                const textNodes = xmlDoc.getElementsByTagName("w:t");
                
                // 提取所有文本节点内容
                const textContents = [];
                for (let j = 0; j < textNodes.length; j++) {
                    const text = textNodes[j].textContent;
                    if (text) {
                        textContents.push(text);
                    }
                }
                
                // 仅处理有文本内容的段落
                if (textContents.length > 0) {
                    // 获取段落ID
                    const paraId = paragraph.ParaID;
                    
                    // 将XML和文本内容添加到结果中
                    result.push({
                        id: paraId,
                        xml: xml,
                        textArray: textContents,
                        text: textContents.join('') // 保留完整文本用于显示
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

// 从XML中提取所有w:t标签内容
export const extractTextNodesFromXml = (xml) => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "text/xml");
        
        // 获取所有w:t标签
        return xmlDoc.getElementsByTagName("w:t");
    } catch (error) {
        console.error('解析XML内容时出错:', error);
        return [];
    }
};

// 从XML中提取所有文本片段
export const extractTextFragmentsFromXml = (xml) => {
    try {
        const textNodes = extractTextNodesFromXml(xml);
        const fragments = [];
        
        for (let i = 0; i < textNodes.length; i++) {
            const text = textNodes[i].textContent;
            if (text && text.trim()) {
                fragments.push(text);
            }
        }
        
        return fragments;
    } catch (error) {
        console.error('提取文本片段时出错:', error);
        return [];
    }
};

// 提取当前选中的段落数据
export const extractSelectedText = () => {
    try {
        const selection = window.Application.Selection;
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

// 结构化数据转文本
export const structuredDataToText = (data) => {
    return data.map(item => item.text).join('\n\n');
};

// 将文本分成多个块以避免API限制
export const splitPlainTextIntoChunks = (text, chunkSize = 3000) => {
    if (!text || text.length <= chunkSize) {
        return [text];
    }
    
    const chunks = [];
    
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

// 按句子分割文本
const splitBySentences = (text, chunkSize) => {
    const chunks = [];
    
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

// 流式优化请求
export const retryStreamOptimization = async (params, callback) => {
    return new Promise((resolve, reject) => {
        let accumulatedData = '';
        
        submitStreamOptimizationWithFetch({
            messages: params.messages,
            signal: params.signal,
            onData: (chunk, accumulated) => {
                // 每次收到数据时调用
                if (params.onData) {
                    params.onData(chunk);
                }
                // 更新累积的数据
                accumulatedData = accumulated;
            },
            onError: (error) => {
                // 发生错误时调用
                if (params.onError) {
                    params.onError(error);
                }
                reject(error);
            },
            onComplete: (finalData) => {
                // 请求完成时调用
                const responseData = {
                    data: {
                        choices: [
                            {
                                message: {
                                    content: finalData
                                },
                                finish_reason: 'stop'
                            }
                        ]
                    }
                };
                
                if (params.onComplete) {
                    params.onComplete(responseData);
                }
                
                resolve(responseData);
            }
        });
    });
};

// 流式词语纠错请求
export const retryStreamWordCorrection = async (params) => {
    return new Promise((resolve, reject) => {
        let accumulatedData = '';
        
        submitStreamWordCorrection({
            messages: params.messages,
            signal: params.signal,
            onData: (chunk, accumulated) => {
                // 每次收到数据时调用
                if (params.onData) {
                    params.onData(chunk, accumulated);
                }
                // 更新累积的数据
                accumulatedData = accumulated;
            },
            onError: (error) => {
                // 发生错误时调用
                if (params.onError) {
                    params.onError(error);
                }
                reject(error);
            },
            onComplete: (finalData) => {
                // 请求完成时调用
                const responseData = {
                    data: {
                        choices: [
                            {
                                message: {
                                    content: finalData
                                },
                                finish_reason: 'stop'
                            }
                        ]
                    }
                };
                
                if (params.onComplete) {
                    params.onComplete(responseData);
                }
                
                resolve(responseData);
            }
        });
    });
};

// 重试优化请求
export const retryOptimization = async (params, maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await submitOptimization(params);
        } catch (error) {
            if (error?.name === 'AbortError' || error?.name === 'CanceledError') {
                throw error;
            }
            
            lastError = error;
            
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
    
    throw lastError || new Error('优化请求失败，已达到最大重试次数');
};

// 重试词语纠错请求
export const retryWordCorrection = async (params, maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await submitWordCorrection(params);
        } catch (error) {
            if (error?.name === 'AbortError' || error?.name === 'CanceledError') {
                throw error;
            }
            
            lastError = error;
            
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
    
    throw lastError || new Error('词语纠错请求失败，已达到最大重试次数');
};

// 替换文档中的段落
export const replaceParagraphInDocument = (paragraphId, originalItem, optimizedText) => {
    try {
        const paragraphCount = window.Application.ActiveDocument.Paragraphs.Count;
        let replaced = false;
        let paragraphStart = -1;
        
        // 判断originalItem的类型
        let originalTextArray = [];
        let originalTextString = '';
        
        if (typeof originalItem === 'string') {
            // 如果传入的是字符串（旧版本兼容），直接使用
            originalTextString = originalItem;
        } else if (typeof originalItem === 'object') {
            // 如果传入的是对象，获取textArray和text
            originalTextArray = originalItem.textArray || [];
            originalTextString = originalItem.text || originalItem;
        }
        
        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window.Application.ActiveDocument.Paragraphs.Item(i);
            try {
                // 使用paraID进行比对
                if (paragraph.ParaID === paragraphId) {
                    // 获取段落起始位置
                    paragraphStart = paragraph.Range.Start;
                    
                    // 获取原始XML
                    const xml = paragraph.Range.WordOpenXML;
                    
                    // 使用改进后的replaceTextInWordXml函数
                    // 如果有textArray，优先使用textArray
                    const newXml = replaceTextInWordXml(
                        xml, 
                        originalTextArray.length > 0 ? originalTextArray : originalTextString,
                        optimizedText
                    );
                    
                    // 插入修改后的XML
                    paragraph.Range.InsertXML(newXml);
                    
                    // 保存状态信息
                    localStorage.setItem('replacedParagraphXML', newXml);
                    localStorage.setItem('originalText', JSON.stringify(originalTextArray.length > 0 ? originalTextArray : originalTextString));
                    localStorage.setItem('optimizedText', optimizedText);
                    localStorage.setItem('currentPosition', paragraphStart);
                    
                    replaced = true;
                    break;
                }
            } catch (error) {
                console.error('替换段落时出错:', error);
                continue;
            }
        }
        
        return { replaced, position: paragraphStart };
    } catch (error) {
        console.error('替换失败:', error);
        return { replaced: false, position: -1 };
    }
};

// 在WordOpenXML中替换文本内容
export const replaceTextInWordXml = (xml, originalText, optimizedText) => {
    try {
        // 类型检查，如果originalText是字符串，转换为数组
        let originalTextArray = [];
        if (typeof originalText === 'string') {
            // 为了兼容之前的代码，如果传入的是字符串，尝试在XML中找到匹配项
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xml, "text/xml");
            const textNodes = xmlDoc.getElementsByTagName("w:t");
            
            // 获取XML中的所有文本节点
            for (let i = 0; i < textNodes.length; i++) {
                originalTextArray.push(textNodes[i].textContent);
            }
        } else if (Array.isArray(originalText)) {
            originalTextArray = originalText;
        } else {
            console.error('originalText必须是字符串或数组');
            return xml;
        }
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "text/xml");
        
        // 获取所有w:t标签
        const textNodes = xmlDoc.getElementsByTagName("w:t");
        
        // 确保textNodes数量与originalTextArray匹配
        if (textNodes.length !== originalTextArray.length) {
            console.warn(`XML中的文本节点数量(${textNodes.length})与原始文本数组长度(${originalTextArray.length})不匹配`);
            
            // 尝试进行传统的字符串匹配
            return replaceTextByStringMatching(xml, originalTextArray.join(''), optimizedText);
        }
        
        // 检查原始文本总长度
        const originalTotalLength = originalTextArray.reduce((sum, text) => sum + text.length, 0);
        
        if (originalTotalLength === 0) {
            console.warn('原始文本总长度为0，无法进行替换');
            return xml;
        }
        
        // 智能分配优化后的文本到各个节点
        // 计算每个节点应该分配的文本比例
        const nodeRatios = originalTextArray.map(text => text.length / originalTotalLength);
        
        // 分配优化后的文本
        let remainingText = optimizedText;
        
        for (let i = 0; i < textNodes.length; i++) {
            if (i === textNodes.length - 1) {
                // 对最后一个节点，分配所有剩余文本
                textNodes[i].textContent = remainingText;
                break;
            }
            
            // 计算当前节点应该分配的文本长度
            const ratio = nodeRatios[i];
            const allocatedLength = Math.floor(optimizedText.length * ratio);
            
            // 至少分配一个字符，确保不会分配空内容
            const nodeTextLength = Math.max(1, allocatedLength);
            
            // 为当前节点分配文本
            textNodes[i].textContent = remainingText.substring(0, nodeTextLength);
            
            // 更新剩余文本
            remainingText = remainingText.substring(nodeTextLength);
        }
        
        // 将修改后的XML文档转换回字符串
        const serializer = new XMLSerializer();
        return serializer.serializeToString(xmlDoc);
    } catch (error) {
        console.error('替换XML内容时出错:', error);
        return xml; // 出错时返回原始XML
    }
};

// 使用字符串匹配方式替换文本
const replaceTextByStringMatching = (xml, originalText, optimizedText) => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "text/xml");
        
        // 获取所有w:t标签
        const textNodes = xmlDoc.getElementsByTagName("w:t");
        
        // 提取文本节点内容，并保持原始结构
        const textNodeInfo = [];
        for (let i = 0; i < textNodes.length; i++) {
            textNodeInfo.push({
                node: textNodes[i],
                text: textNodes[i].textContent,
                startIndex: -1, // 在组合文本中的起始位置
                endIndex: -1    // 在组合文本中的结束位置
            });
        }
        
        // 计算每个节点在组合文本中的位置
        let combinedText = '';
        for (let i = 0; i < textNodeInfo.length; i++) {
            textNodeInfo[i].startIndex = combinedText.length;
            combinedText += textNodeInfo[i].text;
            textNodeInfo[i].endIndex = combinedText.length;
        }
        
        // 检查组合文本中是否包含原始文本
        const startPos = combinedText.indexOf(originalText);
        if (startPos === -1) {
            console.warn('未在XML中找到匹配的原始文本，无法替换');
            return xml;
        }
        
        const endPos = startPos + originalText.length;
        
        // 确定哪些节点需要修改
        const nodesToModify = textNodeInfo.filter(node => 
            (node.startIndex <= startPos && node.endIndex > startPos) || // 包含开始
            (node.startIndex >= startPos && node.endIndex <= endPos) ||  // 完全包含
            (node.startIndex < endPos && node.endIndex >= endPos)        // 包含结束
        );
        
        if (nodesToModify.length === 0) {
            console.warn('找不到需要修改的节点');
            return xml;
        }
        
        // 单节点替换 - 如果原始文本刚好在一个节点中
        if (nodesToModify.length === 1 && 
            nodesToModify[0].startIndex <= startPos && 
            nodesToModify[0].endIndex >= endPos) {
            
            const node = nodesToModify[0];
            const nodeText = node.text;
            const relativeStart = startPos - node.startIndex;
            const relativeEnd = endPos - node.startIndex;
            
            // 替换节点内容
            node.node.textContent = 
                nodeText.substring(0, relativeStart) + 
                optimizedText + 
                nodeText.substring(relativeEnd);
                
            console.log(`替换单个节点: "${originalText}" -> "${optimizedText}"`);
        } 
        // 多节点替换
        else {
            // 第一个节点 - 保留前缀，替换后缀
            const firstNode = nodesToModify[0];
            const relativeStart = startPos - firstNode.startIndex;
            
            // 最后一个节点 - 替换前缀，保留后缀
            const lastNode = nodesToModify[nodesToModify.length - 1];
            const relativeEnd = endPos - lastNode.startIndex;
            
            if (nodesToModify.length === 1) {
                // 特殊情况：节点内容与要替换的文本部分匹配
                firstNode.node.textContent = 
                    firstNode.text.substring(0, relativeStart) + 
                    optimizedText + 
                    firstNode.text.substring(relativeEnd);
            } else {
                // 处理第一个节点
                firstNode.node.textContent = 
                    firstNode.text.substring(0, relativeStart) + 
                    (nodesToModify.length === 1 ? optimizedText : '');
                
                // 处理中间节点（如果有）
                for (let i = 1; i < nodesToModify.length - 1; i++) {
                    nodesToModify[i].node.textContent = '';
                }
                
                // 处理最后一个节点
                if (nodesToModify.length > 1) {
                    lastNode.node.textContent = 
                        (firstNode === lastNode ? '' : optimizedText) + 
                        lastNode.text.substring(relativeEnd);
                }
            }
            
            console.log(`替换跨节点文本: "${originalText}" -> "${optimizedText}"`);
        }
        
        // 将修改后的XML文档转换回字符串
        const serializer = new XMLSerializer();
        return serializer.serializeToString(xmlDoc);
    } catch (error) {
        console.error('字符串匹配替换XML内容时出错:', error);
        return xml; // 出错时返回原始XML
    }
};

// 定位到文档中的段落
export const locateParagraphInDocument = (paragraphId) => {
    try {
        const paragraphCount = window.Application.ActiveDocument.Paragraphs.Count;
        let found = false;
        let paragraphStart = -1;
        
        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window.Application.ActiveDocument.Paragraphs.Item(i);
            try {
                // 使用paraID进行比对
                if (paragraph.ParaID === paragraphId) {
                    // 获取段落起始位置
                    paragraphStart = paragraph.Range.Start;
                    
                    // 选中段落
                    paragraph.Range.Select();
                    found = true;
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!found) {
            alert('未找到对应内容的段落');
        }
        
        // 返回找到的段落起始位置，如果未找到则返回-1
        return { found, position: paragraphStart };
    } catch (error) {
        alert('定位失败: ' + (error.message || String(error)));
        return { found: false, position: -1 };
    }
};

// 处理文档中的图片换行问题
export const handleImageLineBreak = () => {
    try {
        const ActiveDocument = window.Application.ActiveDocument;
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

// 准备发送给deepseek的数据格式 - 更新版
export const prepareDataForDeepseek = (paragraphs) => {
    // 只发送id和text，让接口自己判断错误词语
    return paragraphs.map(paragraph => ({
        paraID: paragraph.id,
        text: paragraph.text       // 合并后的文本（用于兼容和显示）
    }));
};

// 构建优化API的消息提示
export const buildOptimizationMessages = (dataForDeepseek) => {
    return [
        {
            role: "system",
            content: `你是一个专业的文章优化助手，尤其擅长商务、政务文档的优化。请仅对文本进行词语级别的精确替换和优化，保持原文结构和主要内容不变。替换时尽量一对一替换词语，不要添加新内容，不要重写整个句子。
            
            输入数据中的每个元素包含：
            1. paraID：段落ID
            2. text：完整文本
            3. textArray：文本节点数组，代表每个段落中的各个文本节点
            
            请注意：
            - 你需要生成优化后的单个文本字符串，而不是数组
            - 对于数组中的第一个元素（如果存在），视为标题，不要增加其字数
            - 如果判断某段文本不需要优化，请保持原样（使用text字段的内容）
            - 你的目标是使优化后的文本与原文有最小的差异，但提高表达质量
            - 优化粒度应限制在单个词语或短语级别，不要更改整体结构
            - 返回相同格式的JSON，但每个元素只需包含paraID和优化后的text
            
            商务政务文档优化要求：
            - 请多关注上下文，确保专业术语在特定语境中的准确性和一致性
            - 优先使用正式、规范的表达方式，避免口语化、网络用语
            - 选择更精准、严谨的词语，提升文档的专业性和权威性
            - 注重措辞的客观性和中立性，避免过于感性或夸张的表达
            - 保持语言的简洁清晰，去除冗余词语和不必要的修饰
            - 根据文档上下文，使用符合该领域惯例的术语和表达方式`
        },
        {
            role: "user",
            content: `请对以下JSON格式的文章内容进行词语级别的优化，按照商务政务文档的标准调整用词，仅替换需要改进的个别词语，保持整体结构不变。返回优化后相同格式的JSON：\n\n${JSON.stringify(dataForDeepseek)}`
        }
    ];
};

// 更新deepseek返回的优化数据 - 更新版
export const updateOptimizedData = (originalData, optimizedData) => {
    const result = [];
    
    // optimizedData的格式应该是: [{paraID: 'id', text: '优化后的文本'}]
    for (const optItem of optimizedData) {
        const originalItem = originalData.find(item => item.id === optItem.paraID);
        if (originalItem) {
            // 检查文本是否有变化
            const hasChanges = originalItem.text.trim() !== optItem.text.trim();
            
            // 将处理后的数据添加到结果中
            result.push({
                id: optItem.paraID,
                originalText: originalItem.text,
                textArray: originalItem.textArray, // 保留原始文本数组
                xml: originalItem.xml,            // 保留原始XML
                text: optItem.text,               // 优化后的文本
                notImprove: !hasChanges,
                diff: [],  // 初始化差异数组
                replaced: false
            });
        }
    }
    
    return result;
};

// 准备发送给deepseek的词语纠错数据
export const prepareDataForWordCorrection = (paragraphs) => {
    // 发送id、text和textArray（文本节点数组）
    return paragraphs.map(paragraph => ({
        paraID: paragraph.id,
        text: paragraph.text,
        textArray: paragraph.textArray
    }));
};

// 构建词语纠错API的消息提示
export const buildWordCorrectionMessages = (dataForDeepseek) => {
    return [
        {
            role: "system",
            content: `你是一个专业的词语纠错助手，尤其擅长商务政务类文档的纠错。你的任务是识别文本中使用不当或错误的词语，并提供正确的替代词。请仅对词语进行纠正，保持原文结构不变。

            输入数据中的每个元素包含：
            1. paraID：段落ID
            2. text：完整文本
            
            请注意：
            - 你的任务是识别文本中在语义上、逻辑性上或适用性上不正确的词语
            - 每处纠正都需要提供明确的理由，说明为什么原词不合适以及为何替换词更好
            - 只纠正确实存在问题的词语，不要改动表达正确的内容
            - 纠正应考虑词语在上下文中的适用性和语义连贯性
            - 返回JSON格式，包含段落ID、纠正后的完整文本，以及详细的纠正列表
            
            商务政务文档纠错要求：
            - 多参考文档的上下文环境，根据文档类型和主题选择恰当的词语
            - 注重专业术语的准确性和规范使用，避免混用相近术语
            - 修正后的词语应符合政府文件、商业报告等正式文档的表达习惯
            - 坚持使用规范化、标准化的词汇，避免非正式表达
            - 确保词语符合特定行业或领域的专业术语和惯用表达
            - 重视语言的简洁性和精确性，去除冗余和模糊表达
            - 保持语言风格的一致性和连贯性，符合整体文档基调`
        },
        {
            role: "user",
            content: `请检查以下JSON格式的文本内容中存在的词语错误，根据商务政务文档的标准，提供符合规范的纠正建议：\n\n${JSON.stringify(dataForDeepseek)}\n\n请按以下JSON格式返回纠错结果：
            [{
              "paraID": "段落ID", 
              "text": "纠正后的文本", 
              "corrections": [
                {"originText": "错误词语", "replacedText": "纠正词语", "reason": "纠正理由"}
              ]
            }]
            
            注意：
            1. 只标记真正有误的词语，不要修改正确的表达
            2. 纠正的理由应简洁明了地说明为什么原词语存在问题以及为何替换词更合适
            3. 如果某个段落没有需要纠正的内容，请保持原文不变并在corrections中返回空数组
            4. 直接返回JSON格式数据，无需其他说明`
        }
    ];
};

// 更新deepseek返回的词语纠错数据
export const updateWordCorrectionData = (originalData, correctionData) => {
    const result = [];
    
    // correctionData的格式应该是: [{paraID: 'id', text: '纠正后的文本', corrections: [{originText, replacedText, reason}]}]
    for (const corrItem of correctionData) {
        const originalItem = originalData.find(item => item.id === corrItem.paraID);
        if (originalItem) {
            // 检查是否有需要纠正的内容
            const hasCorrections = corrItem.corrections && corrItem.corrections.length > 0;
            
            // 将处理后的数据添加到结果中
            result.push({
                id: corrItem.paraID,
                originalText: originalItem.text,
                textArray: originalItem.textArray, // 保留原始文本数组用于替换操作
                xml: originalItem.xml,            // 保留原始XML
                text: corrItem.text,              // 纠正后的文本
                corrections: corrItem.corrections || [], // 纠正详情
                noCorrection: !hasCorrections,
                replaced: false
            });
        }
    }
    
    return result;
};

// 替换组合段落
export const replaceCombinedParagraphInDocument = (paragraphId, originalText, optimizedText) => {
    try {
        const paragraphCount = window.Application.ActiveDocument.Paragraphs.Count;
        let replaced = false;
        let paragraphStart = -1;
        
        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window.Application.ActiveDocument.Paragraphs.Item(i);
            try {
                // 使用paraID进行比对
                if (paragraph.ParaID === paragraphId) {
                    // 获取段落起始位置
                    paragraphStart = paragraph.Range.Start;
                    
                    // 获取原始XML
                    const xml = paragraph.Range.WordOpenXML;
                    
                    // 直接使用改进后的replaceTextInWordXml函数
                    const newXml = replaceTextInWordXml(xml, originalText, optimizedText);
                    
                    // 插入修改后的XML
                    paragraph.Range.InsertXML(newXml);
                    replaced = true;
                    
                    // 保存位置信息
                    localStorage.setItem('currentPosition', paragraphStart);
                    
                    break;
                }
            } catch (error) {
                console.error('替换组合段落时出错:', error);
                continue;
            }
        }
        
        return { replaced, position: paragraphStart };
    } catch (error) {
        console.error('替换组合段落失败:', error);
        return { replaced: false, position: -1 };
    }
}; 