import os
import json
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="WPS Copilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

SYSTEM_PROMPT = """你是嵌入在 WPS Office 中的 AI 写作 Copilot。

你只能输出严格的 JSON 对象，禁止输出任何 JSON 以外的内容，禁止使用代码块标记。

必须输出的 JSON 结构（三个字段缺一不可）：
{"reply":"...","action":"replace|insert|format|none","new_content":"..."}

字段规则：
- reply：中文自然语言回复，展示在聊天界面，简洁友好，可说明你做了什么
- action：四选一
  * "replace" — 用 new_content 替换用户当前在文档中选中的文字（纯文本）
  * "insert"  — 在用户光标位置后插入 new_content（纯文本）
  * "format"  — 对选中文字设置字体格式，new_content 为 JSON 字符串，见下方规则
  * "none"    — 纯对话，不操作文档
- new_content：
  * action 为 replace/insert 时：写入文档的纯文字
  * action 为 format 时：合法 JSON 字符串，只包含要改变的字段，其余省略：
      {
        "fontName": "字体名",
        "fontSize": 磅值数字,
        "bold": true/false,
        "italic": true/false,
        "underline": true/false,
        "spaceBefore": 磅值数字,
        "spaceAfter":  磅值数字,
        "lineSpacingRule": 整数,
        "lineSpacing": 磅值数字,
        "alignment": 整数,
        "firstLineIndent": 磅值数字
      }
  * action 为 none 时：空字符串 ""

字号对照表（号 → 磅值），fontSize 填磅值：
  初号=42  小初=36  一号=26  小一=24  二号=22  小二=18
  三号=16  小三=15  四号=14  小四=12  五号=10.5  小五=9  六号=7.5

lineSpacingRule 必须用数字，禁止用任何枚举名：
  0=单倍行距  1=1.5倍行距  2=双倍行距  3=最小值  4=固定值  5=多倍行距
  常用示例：1.5倍→{"lineSpacingRule":1}；固定20磅→{"lineSpacingRule":4,"lineSpacing":20}

alignment 数字：0=左对齐  1=居中  2=右对齐  3=两端对齐

判断逻辑（按优先级）：
1. 用户要求改字体、字号、行距、段距、对齐方式、加粗、斜体等格式 → action="format"
2. 用户要求改写/优化/替换/润色选中内容的文字 → action="replace"
3. 用户要求插入/续写/添加/生成新内容 → action="insert"
4. 用户提问、聊天、请求建议 → action="none"

示例：
  "改成宋体小四号" → {"reply":"已设置宋体小四号","action":"format","new_content":"{\"fontName\":\"宋体\",\"fontSize\":12}"}
  "设置1.5倍行距，段前6磅" → {"reply":"已设置行距和段前间距","action":"format","new_content":"{\"lineSpacingRule\":1,\"spaceBefore\":6}"}
  "加粗居中" → {"reply":"已加粗并居中","action":"format","new_content":"{\"bold\":true,\"alignment\":1}"}

绝对禁止：输出 JSON 以外任何字符、缺少字段、action 值不在枚举范围内、lineSpacingRule 用枚举名。"""


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    context_text: Optional[str] = ""


@app.post("/api/chat")
async def chat(request: ChatRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not configured")

    messages = [m.dict() for m in request.messages]

    # Append selected context to the last user message
    if request.context_text and messages and messages[-1]["role"] == "user":
        messages[-1] = {
            **messages[-1],
            "content": f"{messages[-1]['content']}\n\n[当前选中文本]：{request.context_text}",
        }

    full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    last_error = "unknown error"
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    DEEPSEEK_URL,
                    headers={
                        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "deepseek-chat",
                        "messages": full_messages,
                        "temperature": 0.3,
                        "response_format": {"type": "json_object"},
                    },
                )

            if resp.status_code != 200:
                last_error = f"DeepSeek API error {resp.status_code}: {resp.text}"
                continue

            content = resp.json()["choices"][0]["message"]["content"]
            result = json.loads(content)

            # Validate required fields
            for field in ("reply", "action", "new_content"):
                if field not in result:
                    raise ValueError(f"missing field: {field}")

            if result["action"] not in ("replace", "insert", "format", "none"):
                result["action"] = "none"

            return result

        except json.JSONDecodeError as e:
            last_error = f"JSON parse error (attempt {attempt + 1}): {e}"
        except ValueError as e:
            last_error = f"Validation error (attempt {attempt + 1}): {e}"
        except httpx.TimeoutException:
            last_error = f"Request timeout (attempt {attempt + 1})"
        except Exception as e:
            last_error = str(e)

    raise HTTPException(status_code=500, detail=f"All retries failed: {last_error}")


@app.get("/health")
async def health():
    return {"status": "ok"}
