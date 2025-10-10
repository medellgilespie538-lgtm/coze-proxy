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
        error: '缺少必需参数: coze_token 或 workflow_id'
      });
    }
    
    const { coze_token, workflow_id, is_async, connector_id, ...userParams } = requestBody;
    
    // 智能参数映射
    let workflowParameters = {};
    
    if (userParams.input !== undefined) {
      workflowParameters = userParams;
    } else if (userParams.input_text !== undefined) {
      workflowParameters.input = userParams.input_text;
    } else if (userParams.message !== undefined) {
      workflowParameters.input = userParams.message;
    } else if (userParams.text !== undefined) {
      workflowParameters.input = userParams.text;
    } else {
      workflowParameters = userParams;
    }
    
    console.log('📥 收到工作流请求');
    console.log('📦 处理后的参数:', workflowParameters);
    
    // 🎯 关键修复：默认使用同步模式
    const isAsync = is_async === true;
    
    const requestPayload = {
      workflow_id: WORKFLOW_ID,
      parameters: workflowParameters
    };
    
    // 如果用户明确要求异步执行
    if (isAsync) {
      requestPayload.is_async = true;
    }
    
    // 如果提供了 connector_id，添加到请求中
    if (connector_id) {
      requestPayload.connector_id = connector_id;
    }
    
    console.log('🚀 发送到扣子API:', JSON.stringify(requestPayload, null, 2));
    
    const response = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload)
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
    console.log('📤 原始响应:', JSON.stringify(result, null, 2));
    
    // 🎯 处理异步模式的响应
    if (isAsync) {
      // 异步模式：返回 execute_id 供后续查询
      return res.status(200).json({
        success: true,
        mode: 'async',
        execute_id: result.data,
        message: '工作流已提交，请使用 execute_id 查询结果',
        timestamp: new Date().toISOString()
      });
    }
    
    // 🎯 同步模式：解析并提取实际的工作流输出
    let workflowOutput = result;
    
    // 如果返回的 data 是字符串格式的 JSON，尝试解析
    if (result.data && typeof result.data === 'string') {
      try {
        const parsed = JSON.parse(result.data);
        workflowOutput = parsed;
      } catch (e) {
        console.log('⚠️  无法解析 data 字段，使用原始数据');
      }
    }
    
    return res.status(200).json({
      success: true,
      mode: 'sync',
      data: result,                    // 完整的原始响应
      output: workflowOutput,          // 解析后的输出
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('💥 执行出错:', error.message);
    console.error('💥 错误堆栈:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}
