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
      version: '1.0.1',
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
    // 确保req.body正确解析
    let requestBody = req.body || {};
    
    if (typeof requestBody === 'string') {
      try {
        requestBody = JSON.parse(requestBody);
      } catch (e) {
        console.error('⚠️ 无法解析请求体为JSON:', e.message);
        return res.status(400).json({
          success: false,
          error: '请求体格式不正确，无法解析为JSON',
          details: e.message
        });
      }
    }

    console.log('📄 原始请求体:', JSON.stringify(requestBody, null, 2));
    
    // 🎯 优先级: 请求参数 > 环境变量 > 硬编码默认值
    const COZE_TOKEN = requestBody.coze_token 
      || process.env.COZE_TOKEN 
      || 'cste1_14t8WnyY7Ykyqu7JrKSYH+WKGPAj62VIa8jYoknNxPiov86pz1H7bD';
    
    const WORKFLOW_ID = requestBody.workflow_id 
      || process.env.WORKFLOW_ID 
      || '7559227203788587047';
    
    // 验证必需参数
    if (!COZE_TOKEN) {
      console.error('❌ 缺少必需参数: COZE_TOKEN');
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: coze_token',
        hint: '请在请求body中传入，或在Vercel环境变量中配置'
      });
    }

    if (!WORKFLOW_ID) {
      console.error('❌ 缺少必需参数: WORKFLOW_ID');
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: workflow_id',
        hint: '请在请求body中传入，或在Vercel环境变量中配置'
      });
    }
    
    // 从请求体中提取参数
    const { coze_token, workflow_id, is_async, connector_id, ...userParams } = requestBody;
    
    // 🎯 智能参数映射 - 自动识别常见的输入字段名
    let workflowParameters = {};
    
    if (userParams.input !== undefined) {
      // 如果有 input 字段，直接使用
      workflowParameters.input = userParams.input;
    } else if (userParams.input_text !== undefined) {
      // 如果是 input_text，映射为 input
      workflowParameters.input = userParams.input_text;
    } else if (userParams.message !== undefined) {
      // 如果是 message，映射为 input
      workflowParameters.input = userParams.message;
    } else if (userParams.text !== undefined) {
      // 如果是 text，映射为 input
      workflowParameters.input = userParams.text;
    } else if (Object.keys(userParams).length > 0) {
      // 否则使用所有剩余参数
      workflowParameters = userParams;
    } else {
      // 如果没有找到任何输入参数
      console.error('❌ 缺少工作流输入参数');
      return res.status(400).json({
        success: false,
        error: '缺少工作流输入参数',
        hint: '请提供至少一个输入参数，如input, input_text, message或text',
        received: requestBody
      });
    }

    // 验证workflowParameters不能为空
    if (Object.keys(workflowParameters).length === 0) {
      console.error('❌ 工作流参数不能为空');
      return res.status(400).json({
        success: false,
        error: '工作流参数不能为空',
        receivedBody: requestBody
      });
    }
    
    console.log('📥 收到工作流请求');
    console.log('🔑 Token:', COZE_TOKEN.substring(0, 10) + '...');
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
    const cozeApiUrl = 'https://api.coze.cn/v1/workflow/run';
    console.log(`🔗 请求API: ${cozeApiUrl}`);
    
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload)
    };
    
    try {
      const response = await fetch(cozeApiUrl, fetchOptions);
      console.log(`🔄 响应状态码: ${response.status}`);
      
      // 获取响应头信息并记录
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      console.log('📋 响应头:', JSON.stringify(responseHeaders, null, 2));
      
      // 尝试解析响应体
      let result;
      try {
        result = await response.json();
        console.log('📄 响应体:', JSON.stringify(result, null, 2));
      } catch (jsonError) {
        const textResponse = await response.text();
        console.error('⚠️ 无法解析响应为JSON:', textResponse);
        return res.status(500).json({
          success: false,
          error: '无法解析Coze API响应',
          responseText: textResponse,
          statusCode: response.status
        });
      }
      
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
      
      // 🎯 处理异步模式的响应
      if (isAsync) {
        // 异步模式：返回 execute_id 供后续查询
        // 扣子API异步响应格式: { data: "execute_id_string" } 或 { data: { execute_id: "..." } }
        let executeId = null;
        
        if (result.data) {
          if (typeof result.data === 'string') {
            executeId = result.data;
          } else if (result.data.execute_id) {
            executeId = result.data.execute_id;
          } else if (typeof result.data === 'object') {
            // 如果data是对象但没有execute_id字段，尝试查找其他可能的ID字段
            executeId = result.data.id || result.data.execution_id || result.data.task_id;
          }
        }
        
        // 如果还是没找到，检查result的顶层
        if (!executeId && result.execute_id) {
          executeId = result.execute_id;
        }
        
        // 🎯 扣子平台友好格式：返回扁平结构，方便下游节点直接引用
        // 下游节点可以直接使用 {{output.execute_id}} 而不需要解析 body
        return res.status(200).json({
          // 核心字段放在顶层，方便扣子平台直接引用
          execute_id: executeId,
          coze_token: COZE_TOKEN,  // 传递给下游节点
          workflow_id: WORKFLOW_ID,
          debug_url: result.debug_url || '',
          
          // 状态信息
          success: true,
          mode: 'async',
          message: executeId 
            ? '工作流已提交，请使用 execute_id 查询结果' 
            : '工作流已提交，但未获取到 execute_id（请查看 raw_response）',
          timestamp: new Date().toISOString(),
          
          // 完整响应用于调试（可选）
          raw_response: result
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
          console.log('⚠️ 无法解析 data 字段，使用原始数据:', e.message);
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
      
    } catch (fetchError) {
      console.error('💥 API请求异常:', fetchError.message);
      return res.status(500).json({
        success: false,
        error: '网络请求失败',
        details: fetchError.message,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    // 捕获所有异常
    console.error('💥 执行出错:', error.message);
    console.error('💥 错误类型:', error.name);
    console.error('💥 错误堆栈:', error.stack);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      errorType: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

