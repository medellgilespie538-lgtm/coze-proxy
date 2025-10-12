// api/workflow.js
// 国外扣子 → Vercel → 国内扣子工作流 的简单中转服务
// 功能：接收 URL，传递给国内工作流，返回完整结果

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET 请求：健康检查
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Coze工作流代理服务运行中 ✅',
      usage: 'POST 请求到此地址，body 中传入 {"url": "你的URL"}'
    });
  }

  // 只接受 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: '只支持 POST 请求'
    });
  }

  try {
    // 1. 获取环境变量中的配置
    const COZE_TOKEN = process.env.COZE_TOKEN;
    const WORKFLOW_ID = process.env.WORKFLOW_ID;
    
    // 检查配置是否存在
    if (!COZE_TOKEN || !WORKFLOW_ID) {
      return res.status(500).json({
        success: false,
        error: '服务配置错误：缺少 Token 或 Workflow ID',
        message: '请在 Vercel 环境变量中配置 COZE_TOKEN 和 WORKFLOW_ID'
      });
    }
    
    // 2. 获取国外扣子传来的 URL
    const { url } = req.body || {};
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数',
        message: '请在请求体中传入 {"url": "你的URL"}'
      });
    }
    
    console.log('📥 收到 URL 请求:', url);
    
    // 3. 同步调用国内扣子工作流
    console.log('🔄 正在调用国内扣子工作流...');
    
    const response = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        parameters: {
          input: url  // 将 URL 作为 input 参数传递
        }
      })
    });
    
    // 4. 获取工作流返回结果
    const result = await response.json();
    
    // 5. 检查是否成功
    if (!response.ok) {
      console.error('❌ 国内扣子返回错误:', result);
      return res.status(response.status).json({
        success: false,
        error: '调用国内工作流失败',
        details: result
      });
    }
    
    console.log('✅ 工作流执行成功');
    
    // 6. 直接返回完整结果（不做任何处理）
    return res.status(200).json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('💥 执行出错:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
