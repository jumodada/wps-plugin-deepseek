import { message } from 'antd';

// 检查是否是Word文档
export const isWordDocument = (): boolean => {
    try {
        return !!window._Application.ActiveDocument;
    } catch (error) {
        return false;
    }
};

// 提取段落数据
export const extractParagraphsFromDocument = (): { id: string, text: string }[] => {
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
                const text = paragraph.Range.Text.trim();
                
                // 只添加有文本内容的段落
                if (text) {
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

// 提取当前选中的段落数据
export const extractSelectedText = (): { id: string, text: string } | null => {
    try {
        const selection = window._Application.Selection;
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
export const structuredDataToText = (data: { id: string, text: string }[]): string => {
    return data.map(item => item.text).join('\n\n');
};

// 将文本分成多个块以避免API限制
export const splitPlainTextIntoChunks = (text: string, chunkSize: number = 3000): string[] => {
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

// 按句子分割文本
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

// 重试优化请求
export const retryOptimization = async (params: any, maxRetries: number = 3): Promise<any> => {
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

// 替换文档中的段落
export const replaceParagraphInDocument = (paragraphId: string, newText: string): boolean => {
    try {
        const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
        let replaced = false;
        
        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
            try {
                // 使用paraID进行比对
                if (paragraph.ParaID === paragraphId) {
                    paragraph.Range.Text = newText;
                    replaced = true;
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (replaced) {
            message.success(`已替换内容`);
            return true;
        } else {
            message.warning(`未找到原文内容相符的段落`);
            return false;
        }
    } catch (error: any) {
        message.error('替换失败: ' + (error.message || String(error)));
        return false;
    }
};

// 定位到文档中的段落
export const locateParagraphInDocument = (paragraphId: string): boolean => {
    try {
        const paragraphCount = window._Application.ActiveDocument.Paragraphs.Count;
        let found = false;
        
        for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window._Application.ActiveDocument.Paragraphs.Item(i);
            try {
                // 使用paraID进行比对
                if (paragraph.ParaID === paragraphId) {
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
        
        return found;
    } catch (error: any) {
        message.error('定位失败: ' + (error.message || String(error)));
        return false;
    }
};

// 创建CSS动画
export const injectOptimizationStyles = () => {
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

// 导入API函数
import { submitOptimization } from '../api/deepseek'; 