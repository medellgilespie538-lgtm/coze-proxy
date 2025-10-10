// api/workflow-result.js
// 查询扣子工作流执行结果的API端点

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
  if (req.method === 'GET' && !req.query.execute_id) {
    return res.status(200).json({
      status: 'ok',
      message: '工作流结果查询服务运行中 ✅',
      version: '1.0.0',
      usage: {
        query_by_get: 'GET /api/workflow-result?execute_id=xxx&coze_token=xxx',
        query_by_post: 'POST /api/workflow-result with body: { execute_id, coze_token }'
      }
    });
  }

  try {
    // 支持GET和POST两种方式
    let executeId, cozeToken;
    
    if (req.method === 'GET') {
      // GET请求：从查询参数获取
      executeId = req.query.execute_id;
      cozeToken = req.query.coze_token || process.env.COZE_TOKEN;
    } else if (req.method === 'POST') {
      // POST请求：从请求体获取
      let requestBody = req.body || {};
      
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
      
      executeId = requestBody.execute_id;
      cozeToken = requestBody.coze_token || process.env.COZE_TOKEN;
    } else {
      return res.status(405).json({
        success: false,
        error: '只支持GET和POST请求',
        currentMethod: req.method
      });
    }

    // 验证必需参数
    if (!executeId) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: execute_id',
        hint: 'GET请求使用查询参数 ?execute_id=xxx，POST请求在body中传入'
      });
    }

    if (!cozeToken) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: coze_token',
        hint: '请在请求中传入，或在Vercel环境变量中配置'
      });
    }

    console.log('🔍 查询工作流执行结果');
    console.log('🆔 Execute ID:', executeId);
    console.log('🔑 Token:', cozeToken.substring(0, 10) + '...');

    // 调用扣子API查询结果
    const cozeApiUrl = `https://api.coze.cn/v1/workflow/run/retrieve?execute_id=${executeId}`;
    console.log(`🔗 请求API: ${cozeApiUrl}`);

    const response = await fetch(cozeApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cozeToken}`,
        'Content-Type': 'application/json',
      }
    });

    console.log(`🔄 响应状态码: ${response.status}`);

    // 解析响应
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
        error: '查询工作流结果失败',
        details: result,
        statusCode: response.status
      });
    }

    console.log('✅ 查询成功');

    // 解析执行状态
    const status = result.data?.status || result.status || 'unknown';
    const isCompleted = status === 'success' || status === 'completed' || status === 'finished';
    const isFailed = status === 'failed' || status === 'error';
    const isRunning = status === 'running' || status === 'in_progress';

    // 提取输出数据
    let output = null;
    if (result.data?.output) {
      output = result.data.output;
      // 如果output是字符串格式的JSON，尝试解析
      if (typeof output === 'string') {
        try {
          output = JSON.parse(output);
          console.log('✨ 成功解析output字段');
        } catch (e) {
          console.log('⚠️ output不是JSON格式，保持原样');
        }
      }
    }

    // 返回结果
    return res.status(200).json({
      success: true,
      execute_id: executeId,
      status: status,
      is_completed: isCompleted,
      is_failed: isFailed,
      is_running: isRunning,
      output: output,
      raw_response: result,
      debug_url: result.debug_url,
      message: isCompleted 
        ? '工作流执行完成' 
        : isFailed 
          ? '工作流执行失败' 
          : isRunning 
            ? '工作流正在执行中，请稍后再查询' 
            : '工作流状态未知',
      timestamp: new Date().toISOString()
    });

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
