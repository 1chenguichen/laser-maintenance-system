# -*- coding: utf-8 -*-
import requests
import os

def main():
    if not os.environ.get("FEISHU_APP_ID") or not os.environ.get("FEISHU_APP_SECRET"):
        print("请先设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET")
        return

    token_url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    token_data = {
        "app_id": os.environ["FEISHU_APP_ID"],
        "app_secret": os.environ["FEISHU_APP_SECRET"]
    }

    response = requests.post(token_url, json=token_data)
    token = response.json()["tenant_access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    doc_id = "RLm5dhNuLo9KagxFIoIc01WknYg"

    # 产品愿景要插入在 "1.4 产品价值" (index 28) 之前
    target_index = 28

    # 创建新块 - 产品愿景
    new_blocks = [
        {
            "block_type": 5,
            "heading3": {
                "elements": [{"type": "text_run", "text_run": {"content": "1.4 产品愿景", "text_element_style": {}}}],
                "style": {}
            }
        },
        {
            "block_type": 12,
            "bullet": {
                "elements": [{"type": "text_run", "text_run": {"content": "让每一台激光设备都能获得及时，专业，透明的服务", "text_element_style": {"bold": True}}}],
                "style": {}
            }
        },
        {
            "block_type": 12,
            "bullet": {
                "elements": [{"type": "text_run", "text_run": {"content": "我们致力于构建一个连接设备、客户与工程师的数字化维保平台，通过智能化派单、实时进度追踪、透明化收益机制，解决传统维保行业的信息不对称、响应慢、收费乱、追溯难等痛点。", "text_element_style": {}}}],
                "style": {}
            }
        },
        {
            "block_type": 12,
            "bullet": {
                "elements": [{"type": "text_run", "text_run": {"content": "更快的响应：从报修到工程师到场 ≤ 30 分钟", "text_element_style": {}}}],
                "style": {}
            }
        },
        {
            "block_type": 12,
            "bullet": {
                "elements": [{"type": "text_run", "text_run": {"content": "更透明的服务：费用有标准、进度可查、历史可追溯", "text_element_style": {}}}],
                "style": {}
            }
        },
        {
            "block_type": 12,
            "bullet": {
                "elements": [{"type": "text_run", "text_run": {"content": "更公平的合作：抢单靠手速、提成靠努力", "text_element_style": {}}}],
                "style": {}
            }
        },
        {
            "block_type": 12,
            "bullet": {
                "elements": [{"type": "text_run", "text_run": {"content": "更智能的管理：数据驱动决策、流程自动化", "text_element_style": {}}}],
                "style": {}
            }
        }
    ]

    # 插入新块
    insert_url = f"https://open.feishu.cn/open-apis/docx/v1/documents/{doc_id}/blocks/{doc_id}/children"
    insert_data = {
        "children": new_blocks,
        "index": target_index
    }

    response = requests.post(insert_url, headers=headers, json=insert_data)
    result = response.json()

    if result.get("code") == 0:
        print(f"Successfully inserted {len(new_blocks)} blocks at index {target_index}")
    else:
        print(f"Failed: {result}")


if __name__ == "__main__":
    main()
