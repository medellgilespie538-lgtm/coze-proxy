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
      usage: '支持 POST Body 或 URL 参数两种方式传参'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: '只支持POST和GET请求'
    });
  }

  try {
    // 🎯 同时支持 Request body (JSON) 和 Request parameter (URL参数)
    const bodyParams = req.body || {};
    const queryParams = req.query || {};
    
    // 合并两种参数来源，URL参数优先级更高
    const allParams = { ...bodyParams, ...queryParams };
    
    const COZE_TOKEN = allParams.coze_token || process.env.COZE_TOKEN;
    const WORKFLOW_ID = allParams.workflow_id || process.env.WORKFLOW_ID;
    
    if (!COZE_TOKEN || !WORKFLOW_ID) {
      return res.status(400).json({
        error: '缺少必需参数: coze_token 或 workflow_id'
      });
    }
    
    // 移除配置参数，剩下的就是工作流参数
    const { coze_token, workflow_id, ...workflowParams } = allParams;
    
    console.log('📥 收到工作流请求');
    console.log('📦 参数来源: Body +', Object.keys(queryParams).length, '个URL参数');
    console.log('📦 工作流参数:', workflowParams);
    
    // 调用 Coze API
    const response = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        parameters: workflowParams
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
    
    // 🎯 智能提取输出内容 - 多层解析
    let output = null;
    
    try {
      // 第一层：解析 result.data
      if (result.data) {
        if (typeof result.data === 'string') {
          try {
            output = JSON.parse(result.data);
          } catch {
            output = result.data;
          }
        } else {
          output = result.data;
        }
      }
      
      // 第二层：如果是 {body, statusCode, headers} 格式，提取 body
      if (output && typeof output === 'object' && output.body !== undefined) {
        console.log('📦 检测到包装格式，提取 body');
        
        // body 可能是字符串形式的 JSON，尝试解析
        if (typeof output.body === 'string') {
          try {
            output = JSON.parse(output.body);
          } catch {
            output = output.body;
          }
        } else {
          output = output.body;
        }
      }
      
      // 第三层：如果只有一个 output 字段，直接提取
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
