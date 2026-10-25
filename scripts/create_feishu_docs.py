# -*- coding: utf-8 -*-
import requests
import json
import os
import re

def md_to_blocks(md_content):
    """将 MD 内容转换为飞书文档块"""
    blocks = []
    lines = md_content.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i]

        if not line.strip():
            i += 1
            continue

        # 标题处理
        if line.startswith('#### '):
            blocks.append({
                "block_type": 6,  # heading4
                "heading4": {
                    "elements": [{"type": "text_run", "text_run": {"content": line[5:], "text_element_style": {}}}],
                    "style": {}
                }
            })
        elif line.startswith('### '):
            blocks.append({
                "block_type": 5,  # heading3
                "heading3": {
                    "elements": [{"type": "text_run", "text_run": {"content": line[4:], "text_element_style": {}}}],
                    "style": {}
                }
            })
        elif line.startswith('## '):
            blocks.append({
                "block_type": 4,  # heading2
                "heading2": {
                    "elements": [{"type": "text_run", "text_run": {"content": line[3:], "text_element_style": {}}}],
                    "style": {}
                }
            })
        elif line.startswith('# '):
            blocks.append({
                "block_type": 3,  # heading1
                "heading1": {
                    "elements": [{"type": "text_run", "text_run": {"content": line[2:], "text_element_style": {}}}],
                    "style": {}
                }
            })
        # 表格转为 bullet（带特殊前缀）
        elif line.startswith('|'):
            table_lines = []
            while i < len(lines) and lines[i].startswith('|'):
                if '---' in lines[i] or '--:' in lines[i]:
                    i += 1
                    continue
                table_lines.append(lines[i])
                i += 1
            if table_lines:
                for tl in table_lines:
                    cells = [c.strip() for c in tl.split('|')[1:-1]]
                    text = ' | '.join(cells)
                    blocks.append({
                        "block_type": 12,
                        "bullet": {
                            "elements": [{"type": "text_run", "text_run": {"content": text, "text_element_style": {}}}],
                            "style": {}
                        }
                    })
            continue
        # 代码块转为 bullet
        elif line.startswith('```'):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code_lines.append(lines[i])
                i += 1
            code_content = '\n'.join(code_lines)
            # 代码块转为一个 bullet
            blocks.append({
                "block_type": 12,
                "bullet": {
                    "elements": [{"type": "text_run", "text_run": {"content": "```" + code_content + "```", "text_element_style": {}}}],
                    "style": {}
                }
            })
        # 无序列表
        elif line.startswith('- '):
            blocks.append({
                "block_type": 12,  # bullet
                "bullet": {
                    "elements": [{"type": "text_run", "text_run": {"content": line[2:], "text_element_style": {}}}],
                    "style": {}
                }
            })
        # 普通段落
        else:
            text = line
            text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
            text = re.sub(r'\*(.+?)\*', r'\1', text)
            text = re.sub(r'`(.+?)`', r'\1', text)

            if text.strip():
                blocks.append({
                    "block_type": 12,
                    "bullet": {
                        "elements": [{"type": "text_run", "text_run": {"content": text, "text_element_style": {}}}],
                        "style": {}
                    }
                })

        i += 1

    return blocks


def insert_blocks(doc_id, blocks, headers):
    """分批插入块"""
    batch_size = 50
    for j in range(0, len(blocks), batch_size):
        batch = blocks[j:j+batch_size]
        blocks_url = f"https://open.feishu.cn/open-apis/docx/v1/documents/{doc_id}/blocks/{doc_id}/children"
        blocks_data = {"children": batch}
        response = requests.post(blocks_url, headers=headers, json=blocks_data)
        result = response.json()
        if result.get("code") != 0:
            print(f"  插入块失败 (batch {j//batch_size}): {result.get('msg', result)}")
            return False
    return True


def main():
    # 获取 token
    if not os.environ.get("FEISHU_APP_ID") or not os.environ.get("FEISHU_APP_SECRET"):
        print("请先设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET")
        return

    token_url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    token_data = {
        "app_id": os.environ.get("FEISHU_APP_ID", ""),
        "app_secret": os.environ.get("FEISHU_APP_SECRET", "")
    }

    response = requests.post(token_url, json=token_data)
    result = response.json()

    if result.get("code") != 0:
        print(f"获取 token 失败: {result}")
        return

    token = result["tenant_access_token"]
    print(f"获取 token 成功")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    docs = []

    # PRD 文档
    print("\n=== 创建 PRD 文档 ===")
    response = requests.post(
        "https://open.feishu.cn/open-apis/docx/v1/documents",
        headers=headers,
        json={"title": "激光设备售后维修维保系统 PRD"}
    )
    prd_result = response.json()

    if prd_result.get("code") == 0:
        prd_doc_id = prd_result["data"]["document"]["document_id"]
        print(f"PRD 文档 ID: {prd_doc_id}")

        with open("C:/Users/sh/Desktop/Engineer/docs/PRD.md", "r", encoding="utf-8") as f:
            prd_content = f.read()

        blocks = md_to_blocks(prd_content)
        print(f"转换了 {len(blocks)} 个块")

        if insert_blocks(prd_doc_id, blocks, headers):
            print(f"PRD 文档完成")
            docs.append(("PRD", prd_doc_id))
    else:
        print(f"PRD 创建失败: {prd_result}")

    # SDD 文档
    print("\n=== 创建 SDD 文档 ===")
    response = requests.post(
        "https://open.feishu.cn/open-apis/docx/v1/documents",
        headers=headers,
        json={"title": "激光设备售后维修维保系统 SDD"}
    )
    sdd_result = response.json()

    if sdd_result.get("code") == 0:
        sdd_doc_id = sdd_result["data"]["document"]["document_id"]
        print(f"SDD 文档 ID: {sdd_doc_id}")

        with open("C:/Users/sh/Desktop/Engineer/docs/SDD.md", "r", encoding="utf-8") as f:
            sdd_content = f.read()

        blocks = md_to_blocks(sdd_content)
        print(f"转换了 {len(blocks)} 个块")

        if insert_blocks(sdd_doc_id, blocks, headers):
            print(f"SDD 文档完成")
            docs.append(("SDD", sdd_doc_id))
    else:
        print(f"SDD 创建失败: {sdd_result}")

    # 输出结果
    print("\n" + "="*50)
    print("=== 完成 ===")
    for name, doc_id in docs:
        print(f"{name}: https://nyr6q813ub.feishu.cn/docx/{doc_id}")


if __name__ == "__main__":
    main()
