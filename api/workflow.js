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
      usage: 'POST请求到此地址，直接传入工作流参数',
      example: {
        input: "你的输入内容"
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: '只支持POST和GET请求'
    });
  }

  try {
    const requestBody = req.body || {};
    
    const COZE_TOKEN = requestBody.coze_token || process.env.COZE_TOKEN;
    const WORKFLOW_ID = requestBody.workflow_id || process.env.WORKFLOW_ID;
    
    if (!COZE_TOKEN || !WORKFLOW_ID) {
      return res.status(400).json({
        error: '缺少必需参数: coze_token 或 workflow_id'
      });
    }
    
    // 移除配置参数，剩下的就是工作流参数
    const { coze_token, workflow_id, ...workflowParams } = requestBody;
    
    // 🎯 如果没有传入任何参数，使用默认的 input 字段
    const parameters = Object.keys(workflowParams).length > 0 
      ? workflowParams 
      : { input: "" };
    
    console.log('📥 收到工作流请求，参数:', parameters);
    
    // 调用 Coze API
    const response = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        parameters: parameters
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Coze API错误:', response.status, result);
      return res.status(response.status).json({
        error: 'Coze工作流执行失败',
        details: result
      });
    }
    
    console.log('✅ 工作流执行成功');
    
    // 🎯 智能提取输出内容
    let output = null;
    
    try {
      // 尝试解析 result.data
      if (result.data) {
        if (typeof result.data === 'string') {
          // 如果是字符串，尝试解析 JSON
          try {
            output = JSON.parse(result.data);
          } catch {
            // 解析失败，直接返回字符串
            output = result.data;
          }
        } else {
          // 如果已经是对象，直接使用
          output = result.data;
        }
      }
      
      // 如果 output 是对象且只有一个 output 字段，直接提取
      if (output && typeof output === 'object' && Object.keys(output).length === 1 && output.output) {
        output = output.output;
      }
      
    } catch (error) {
      console.error('⚠️ 输出解析出错，返回原始数据:', error);
      output = result;
    }
    
    // 🎯 返回简化的响应格式
    return res.status(200).json(output || result);
    
  } catch (error) {
    console.error('💥 执行出错:', error.message);
    
    return res.status(500).json({
      error: error.message
    });
  }
}
