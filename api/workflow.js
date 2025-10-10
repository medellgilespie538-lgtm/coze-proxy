// api/workflow.js
// Coze工作流代理 - 部署在Vercel上的API端点

export default async function handler(req, res) {
  // 设置CORS头，允许跨域访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 处理GET请求 - 健康检查
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Coze工作流代理服务运行中 ✅',
      version: '1.0.0',
      usage: {
        health_check: 'GET /api/workflow',
        execute_workflow: 'POST /api/workflow'
      },
      endpoints: {
        health: 'GET /api/workflow',
        execute: 'POST /api/workflow'
      }
    });
  }

  // 只允许POST请求执行工作流
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: '只支持POST和GET请求',
      currentMethod: req.method 
    });
  }

  try {
    // 获取请求体
    const requestBody = req.body || {};
    
    // 🎯 优先级: 请求参数 > 环境变量 > 硬编码默认值
    const COZE_TOKEN = requestBody.coze_token 
      || process.env.COZE_TOKEN 
      || 'cste1_14t8WnyY7Ykyqu7JrKSYH+WKGPAj62VIa8jYoknNxPiov86pz1H7bD';
    
    const WORKFLOW_ID = requestBody.workflow_id 
      || process.env.WORKFLOW_ID 
      || '7559227203788587047';
    
    // 验证必需参数
    if (!COZE_TOKEN || !WORKFLOW_ID) {
      console.error('❌ 缺少必需参数');
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: coze_token 或 workflow_id',
        hint: '请在请求body中传入，或在Vercel环境变量中配置'
      });
    }
    
    // 从请求体中提取参数
    const { coze_token, workflow_id, is_async, connector_id, ...userParams } = requestBody;
    
    // 🎯 智能参数映射 - 自动识别常见的输入字段名
    let workflowParameters = {};
    
    if (userParams.input !== undefined) {
      // 如果有 input 字段，直接使用
      workflowParameters = userParams;
    } else if (userParams.input_text !== undefined) {
      // 如果是 input_text，映射为 input
      workflowParameters.input = userParams.input_text;
    } else if (userParams.message !== undefined) {
      // 如果是 message，映射为 input
      workflowParameters.input = userParams.message;
    } else if (userParams.text !== undefined) {
      // 如果是 text，映射为 input
      workflowParameters.input = userParams.text;
    } else {
      // 否则使用所有剩余参数
      workflowParameters = userParams;
    }
    
    console.log('📥 收到工作流请求');
    console.log('🔑 Token:', COZE_TOKEN.substring(0, 20) + '...');
    console.log('🆔 Workflow ID:', WORKFLOW_ID);
    console.log('📦 处理后的参数:', JSON.stringify(workflowParameters, null, 2));
    
    // 🎯 关键修复：默认使用同步模式
    const isAsync = is_async === true;
    
    // 构建请求体
    const requestPayload = {
      workflow_id: WORKFLOW_ID,
      parameters: workflowParameters
    };
    
    // 如果用户明确要求异步执行
    if (isAsync) {
      requestPayload.is_async = true;
      console.log('⏳ 使用异步模式');
    } else {
      console.log('⚡ 使用同步模式');
    }
    
    // 如果提供了 connector_id，添加到请求中
    if (connector_id) {
      requestPayload.connector_id = connector_id;
      console.log('🔌 Connector ID:', connector_id);
    }
    
    console.log('🚀 发送到扣子API:', JSON.stringify(requestPayload, null, 2));
    
    // 调用扣子API
    const response = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload)
    });
    
    // 解析响应
    const result = await response.json();
    
    // 检查API调用是否成功
    if (!response.ok) {
      console.error('❌ 扣子API错误:', response.status, JSON.stringify(result, null, 2));
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
        console.log('✨ 成功解析data字段');
      } catch (e) {
        console.log('⚠️  无法解析 data 字段，使用原始数据');
      }
    }
    
    // 返回成功响应
    return res.status(200).json({
      success: true,
      mode: 'sync',
      data: result,                    // 完整的原始响应
      output: workflowOutput,          // 解析后的输出
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    // 捕获所有异常
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
