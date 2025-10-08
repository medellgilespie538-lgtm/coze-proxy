// api/workflow.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: '只支持POST和GET请求',
      currentMethod: req.method 
    });
  }

  try {
    const requestBody = req.body || {};
    
    const COZE_TOKEN = requestBody.coze_token || process.env.COZE_TOKEN;
    const WORKFLOW_ID = requestBody.workflow_id || process.env.WORKFLOW_ID;
    
    if (!COZE_TOKEN || !WORKFLOW_ID) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数',
        message: '请在请求体中传入 coze_token 和 workflow_id，或在环境变量中配置',
        required: {
          coze_token: '扣子API Token',
          workflow_id: '工作流ID'
        }
      });
    }
    
    const { coze_token, workflow_id, ...workflowParameters } = requestBody;
    
    console.log('📥 收到工作流请求');
    
    // 调用国内扣子工作流API
    const response = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        parameters: workflowParameters
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ 扣子API错误:', response.status, result);
      return res.status(response.status).json({
        success: false,
        error: '调用扣子工作流失败',
        details: result,
        statusCode: response.status
      });
    }
    
    console.log('✅ 工作流执行成功');
    
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
