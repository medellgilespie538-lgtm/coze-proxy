// api/workflow.js
// 同步触发并等待国内扣子工作流执行完成

export default async function handler(req, res) {
  // 设置CORS头，允许跨域访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: '只支持POST请求',
      currentMethod: req.method
    });
  }

  try {
    // 解析请求体
    let requestBody = req.body || {};
    
    // 如果是字符串，尝试解析为JSON
    if (typeof requestBody === 'string') {
      try {
        requestBody = JSON.parse(requestBody);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: '请求体格式不正确，无法解析为JSON',
          details: e.message
        });
      }
    }

    // 🎯 智能解析：支持扣子平台的嵌套格式
    let workflow_id, input, coze_token, max_wait_time;
    
    if (requestBody.body && typeof requestBody.body === 'string') {
      try {
        const parsedBody = JSON.parse(requestBody.body);
        workflow_id = parsedBody.workflow_id;
        input = parsedBody.input;
        coze_token = parsedBody.coze_token;
        max_wait_time = parsedBody.max_wait_time;
        console.log('✨ 成功解析扣子平台嵌套格式');
      } catch (e) {
        console.log('⚠️ 无法解析body字段，尝试直接获取');
        workflow_id = requestBody.workflow_id;
        input = requestBody.input;
        coze_token = requestBody.coze_token;
        max_wait_time = requestBody.max_wait_time;
      }
    } else {
      workflow_id = requestBody.workflow_id;
      input = requestBody.input;
      coze_token = requestBody.coze_token;
      max_wait_time = requestBody.max_wait_time;
    }

    // 从环境变量获取配置
    workflow_id = workflow_id || process.env.WORKFLOW_ID;
    coze_token = coze_token || process.env.COZE_TOKEN;
    max_wait_time = max_wait_time || 60; // 默认等待60秒

    // 验证必需参数
    if (!workflow_id) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: workflow_id',
        hint: '请在请求body中传入workflow_id，或在Vercel环境变量中配置WORKFLOW_ID'
      });
    }

    if (!coze_token) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: coze_token',
        hint: '请在请求body中传入coze_token，或在Vercel环境变量中配置COZE_TOKEN'
      });
    }

    console.log('🚀 同步触发国内扣子工作流');
    console.log('🆔 Workflow ID:', workflow_id);
    console.log('📥 Input参数:', JSON.stringify(input, null, 2));
    console.log('⏱️  最大等待时间:', max_wait_time, '秒');
    console.log('🔑 Token:', coze_token.substring(0, 10) + '...');

    // === 第一步：触发工作流 ===
    const cozeRequestBody = {
      workflow_id: workflow_id,
      parameters: input || {}
    };

    console.log('📤 发送到扣子的请求体:', JSON.stringify(cozeRequestBody, null, 2));

    const triggerApiUrl = 'https://api.coze.cn/v1/workflow/run';
    console.log(`🔗 触发API: ${triggerApiUrl}`);

    const triggerResponse = await fetch(triggerApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${coze_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cozeRequestBody)
    });

    console.log(`🔄 触发响应状态码: ${triggerResponse.status}`);

    let triggerResult;
    try {
      triggerResult = await triggerResponse.json();
      console.log('📄 触发响应体:', JSON.stringify(triggerResult, null, 2));
    } catch (jsonError) {
      const textResponse = await triggerResponse.text();
      console.error('⚠️ 无法解析触发响应为JSON:', textResponse);
      return res.status(500).json({
        success: false,
        error: '无法解析Coze API触发响应',
        responseText: textResponse,
        statusCode: triggerResponse.status
      });
    }

    // 检查触发是否成功
    if (!triggerResponse.ok || (triggerResult.code && triggerResult.code !== 0)) {
      console.error('❌ 触发工作流失败:', triggerResponse.status, JSON.stringify(triggerResult, null, 2));
      return res.status(triggerResponse.ok ? 200 : triggerResponse.status).json({
        success: false,
        error: '触发工作流失败',
        code: triggerResult.code,
        message: triggerResult.msg || triggerResult.message || '未知错误',
        details: triggerResult,
        statusCode: triggerResponse.status
      });
    }

    // 提取 execute_id
    const execute_id = triggerResult.data?.execute_id || 
                       triggerResult.execute_id;

    if (!execute_id) {
      console.error('⚠️ 触发响应中未找到execute_id:', JSON.stringify(triggerResult, null, 2));
      return res.status(500).json({
        success: false,
        error: '工作流已触发但未返回执行ID',
        details: triggerResult
      });
    }

    console.log('✅ 工作流触发成功，execute_id:', execute_id);

    // === 第二步：轮询查询结果 ===
    console.log('⏳ 开始轮询查询执行结果...');
    
    const startTime = Date.now();
    const pollInterval = 2000; // 每2秒查询一次
    let attemptCount = 0;
    
    while (true) {
      attemptCount++;
      const elapsedTime = (Date.now() - startTime) / 1000;
      
      // 检查是否超时
      if (elapsedTime > max_wait_time) {
        console.log(`⏱️  已超过最大等待时间 ${max_wait_time}秒`);
        return res.status(200).json({
          success: false,
          error: 'timeout',
          message: `工作流执行超时（超过${max_wait_time}秒），请稍后使用execute_id查询结果`,
          execute_id: execute_id,
          debug_url: triggerResult.debug_url || '',
          elapsed_time: elapsedTime,
          attempts: attemptCount
        });
      }

      console.log(`🔍 第 ${attemptCount} 次查询 (已等待 ${elapsedTime.toFixed(1)}秒)`);

      // 查询执行结果
      const queryApiUrl = `https://api.coze.cn/v1/workflow/run/retrieve?execute_id=${execute_id}`;
      
      const queryResponse = await fetch(queryApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${coze_token}`,
          'Content-Type': 'application/json',
        }
      });

      let queryResult;
      try {
        queryResult = await queryResponse.json();
        console.log('📊 查询响应:', JSON.stringify(queryResult, null, 2));
      } catch (jsonError) {
        console.error('⚠️ 无法解析查询响应:', await queryResponse.text());
        // 继续重试
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      // 检查查询是否成功
      if (!queryResponse.ok || (queryResult.code && queryResult.code !== 0)) {
        console.error('❌ 查询失败:', queryResponse.status, JSON.stringify(queryResult, null, 2));
        // 继续重试
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      // 解析执行状态
      const status = queryResult.data?.status || 
                     queryResult.status || 
                     'unknown';
      
      console.log(`📌 当前状态: ${status}`);

      const isCompleted = ['success', 'completed', 'finished', 'succeed'].includes(status);
      const isFailed = ['failed', 'error', 'timeout'].includes(status);

      // 如果执行完成或失败，返回结果
      if (isCompleted || isFailed) {
        console.log(isCompleted ? '✅ 工作流执行完成！' : '❌ 工作流执行失败');

        // 提取输出数据
        let output = queryResult.data?.output || 
                     queryResult.data?.data || 
                     queryResult.output || 
                     queryResult.data;

        // 如果output是字符串，尝试解析为JSON
        if (output && typeof output === 'string') {
          try {
            output = JSON.parse(output);
            console.log('✨ 成功解析output为JSON');
          } catch (e) {
            console.log('ℹ️ output是纯文本格式');
          }
        }

        // 构造返回结果
        const responseData = {
          success: isCompleted,
          execute_id: execute_id,
          status: status,
          message: isCompleted ? '✅ 工作流执行完成' : '❌ 工作流执行失败',
          debug_url: queryResult.debug_url || triggerResult.debug_url || '',
          elapsed_time: elapsedTime,
          attempts: attemptCount,
          timestamp: new Date().toISOString()
        };

        // 添加输出数据
        if (output) {
          responseData.output = output;
          
          // 🎯 如果output是对象，将字段展开到顶层
          if (typeof output === 'object' && !Array.isArray(output)) {
            Object.keys(output).forEach(key => {
              if (!['success', 'status', 'message', 'execute_id', 'output'].includes(key)) {
                responseData[key] = output[key];
              }
            });
            console.log('✨ 已将output字段展开到顶层');
          }
        }

        // 如果执行失败，添加错误信息
        if (isFailed) {
          responseData.error = queryResult.data?.error_message || 
                               queryResult.error || 
                               '工作流执行失败';
        }

        console.log('📤 返回最终结果:', JSON.stringify(responseData, null, 2));
        return res.status(200).json(responseData);
      }

      // 如果还在执行中，等待后继续查询
      console.log(`⏳ 工作流仍在执行中，${pollInterval/1000}秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

  } catch (error) {
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
