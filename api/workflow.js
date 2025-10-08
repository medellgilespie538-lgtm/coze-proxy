// api/workflow.js
// 这是完整的文件，直接复制使用

export default async function handler(req, res) {
  // 允许跨域访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET请求返回服务状态
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Coze工作流代理服务运行中 ✅',
      usage: 'POST请求到此地址，body中传入工作流参数',
      endpoints: {
        health: 'GET /api/workflow',
        execute: 'POST /api/workflow'
      }
    });
  }

  // 只接受POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: '只支持POST和GET请求',
      currentMethod: req.method 
    });
  }

  try {
    // 🔑 从环境变量读取配置（推荐）或使用默认值
    const COZE_TOKEN = process.env.COZE_TOKEN;
    const WORKFLOW_ID = process.env.WORKFLOW_ID;
    
    // 获取用户传入的参数
    const userParameters = req.body || {};
    
    console.log('📥 收到工作流请求, 参数:', userParameters);
    
    // 调用国内扣子工作流API
    const response = await fetch('https://api.coze.cn/v1/workflow/runs/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        parameters: userParameters
      })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 扣子API错误:', response.status, errorText);
      throw new Error(`扣子API返回错误: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    console.log('✅ 工作流执行成功');
    
    // 返回结果
    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('💥 执行出错:', error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
