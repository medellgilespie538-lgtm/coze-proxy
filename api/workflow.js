// api/workflow.js
// 国外扣子 → Vercel → 国内扣子工作流
// 最简洁的同步URL中转服务

export default async function handler(req, res) {
  // CORS 设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // OPTIONS 预检
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET 健康检查
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'Coze Workflow Proxy v2.0',
      message: '服务运行正常',
      usage: 'POST {"url": "your_url_here"}'
    });
  }

  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 从环境变量读取配置
    const TOKEN = process.env.COZE_TOKEN;
    const WORKFLOW_ID = process.env.WORKFLOW_ID;
    
    console.log('🔧 配置检查:');
    console.log('TOKEN 是否存在:', !!TOKEN);
    console.log('WORKFLOW_ID:', WORKFLOW_ID);
    
    if (!TOKEN || !WORKFLOW_ID) {
      return res.status(500).json({
        error: '配置错误',
        message: '缺少 COZE_TOKEN 或 WORKFLOW_ID 环境变量',
        has_token: !!TOKEN,
        has_workflow_id: !!WORKFLOW_ID
      });
    }
    
    // 获取请求体
    const body = req.body || {};
    const { url } = body;
    
    console.log('📥 收到请求:', { url });
    
    if (!url) {
      return res.status(400).json({
        error: '缺少参数',
        message: '请提供 url 参数',
        received: body
      });
    }
    
    // 调用国内扣子 API（同步）
    console.log('🚀 调用国内扣子工作流...');
    console.log('使用 WORKFLOW_ID:', WORKFLOW_ID);
    
    const apiResponse = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        parameters: {
          input: url
        }
      })
    });
    
    const result = await apiResponse.json();
    
    console.log('📊 API 响应状态:', apiResponse.status);
    console.log('📦 返回数据:', JSON.stringify(result).substring(0, 200));
    
    if (!apiResponse.ok) {
      return res.status(apiResponse.status).json({
        error: '工作流调用失败',
        status: apiResponse.status,
        details: result
      });
    }
    
    // 成功返回
    return res.status(200).json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('💥 错误:', error);
    return res.status(500).json({
      error: '服务器错误',
      message: error.message
    });
  }
}
