const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function testFlow() {
  console.log('=== 完整流程测试 ===\n');

  // 1. 客户登录
  console.log('1. 客户登录...');
  const customerLogin = await request({
    hostname: 'localhost', port: 3000, path: '/auth/login',
    method: 'POST', headers: {'Content-Type': 'application/json'}
  }, JSON.stringify({phone:'13800138002', code:'000000', role:'customer'}));
  console.log('   客户登录:', customerLogin.body.user ? '成功' : '失败');
  const customerToken = customerLogin.body.accessToken;

  // 2. 客户发送转人工
  console.log('\n2. 客户发送: 转人工');
  const chat1 = await request({
    hostname: 'localhost', port: 3000, path: '/ai/chat',
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken}
  }, JSON.stringify({message:'转人工'}));
  console.log('   AI回复:', chat1.body.reply);
  console.log('   needHuman:', chat1.body.needHuman);

  // 3. 客服登录
  console.log('\n3. 客服登录...');
  const csLogin = await request({
    hostname: 'localhost', port: 3000, path: '/auth/login',
    method: 'POST', headers: {'Content-Type': 'application/json'}
  }, JSON.stringify({phone:'13800138001', code:'000000', role:'cs_operator'}));
  console.log('   客服登录:', csLogin.body.user ? '成功' : '失败');
  const csToken = csLogin.body.accessToken;
  const csOperatorId = csLogin.body.user.id;

  // 4. 查看等待客户
  console.log('\n4. 查看等待客户列表...');
  const waiting = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/waiting',
    method: 'GET', headers: {'Authorization': 'Bearer ' + csToken}
  });
  console.log('   等待客户数:', waiting.body.length);
  if (waiting.body.length > 0) {
    console.log('   客户:', waiting.body[0].customerName, '-', waiting.body[0].lastMessage);
  }

  // 5. 客服接入客户
  if (waiting.body.length > 0) {
    const customerId = waiting.body[0].customerId;
    console.log('\n5. 客服接入客户:', waiting.body[0].customerName);
    const accept = await request({
      hostname: 'localhost', port: 3000, path: '/ai/cs/accept',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
    }, JSON.stringify({customerId, csOperatorId}));
    console.log('   接入结果:', accept.body.success ? '成功' : '失败');

    // 6. 获取聊天历史
    console.log('\n6. 获取聊天历史...');
    const history = await request({
      hostname: 'localhost', port: 3000, path: '/ai/cs/chats/' + customerId,
      method: 'GET', headers: {'Authorization': 'Bearer ' + csToken}
    });
    console.log('   历史消息数:', history.body.length);

    // 7. 客服发送第一条消息
    console.log('\n7. 客服发送: 您好，请问有什么可以帮助您的？');
    const send1 = await request({
      hostname: 'localhost', port: 3000, path: '/ai/cs/send',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
    }, JSON.stringify({customerId, message: '您好，请问有什么可以帮助您的？'}));
    console.log('   发送成功, ID:', send1.body.id);

    // 8. 客户继续提问
    console.log('\n8. 客户提问: 我的设备不开机了');
    const chat2 = await request({
      hostname: 'localhost', port: 3000, path: '/ai/chat',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken}
    }, JSON.stringify({message:'我的设备不开机了'}));
    console.log('   AI回复:', chat2.body.reply.substring(0, 60) + '...');

    // 9. 客服回复
    console.log('\n9. 客服发送: 请问您的设备是什么型号？');
    const send2 = await request({
      hostname: 'localhost', port: 3000, path: '/ai/cs/send',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
    }, JSON.stringify({customerId, message: '请问您的设备是什么型号？'}));
    console.log('   发送成功');

    // 10. 客户回答
    console.log('\n10. 客户回答: 是LF-3015型号的激光切割机');
    const chat3 = await request({
      hostname: 'localhost', port: 3000, path: '/ai/chat',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken}
    }, JSON.stringify({message:'是LF-3015型号的激光切割机'}));
    console.log('   AI回复:', chat3.body.reply.substring(0, 60) + '...');

    // 11. 客服继续对话
    console.log('\n11. 客服发送: 好的，LF-3015型号。请问设备是完全没反应还是指示灯亮但无法启动？');
    const send3 = await request({
      hostname: 'localhost', port: 3000, path: '/ai/cs/send',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
    }, JSON.stringify({customerId, message: '好的，LF-3015型号。请问设备是完全没反应还是指示灯亮但无法启动？'}));
    console.log('   发送成功');

    // 12. 客户描述症状
    console.log('\n12. 客户描述: 插上电源后指示灯都不亮，完全没反应');
    const chat4 = await request({
      hostname: 'localhost', port: 3000, path: '/ai/chat',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken}
    }, JSON.stringify({message:'插上电源后指示灯都不亮，完全没反应'}));
    console.log('   AI回复:', chat4.body.reply.substring(0, 60) + '...');

    // 13. 客服给出解决方案
    console.log('\n13. 客服发送: 根据您描述的症状，建议先检查：1)电源插座是否有电 2)电源线是否接触良好 3)急停开关是否被按下。如果都没问题，可能是保险丝熔断，建议联系维修');
    const send4 = await request({
      hostname: 'localhost', port: 3000, path: '/ai/cs/send',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
    }, JSON.stringify({customerId, message: '根据您描述的症状，建议先检查：1)电源插座是否有电 2)电源线是否接触良好 3)急停开关是否被按下。如果都没问题，可能是保险丝熔断，建议联系维修'}));
    console.log('   发送成功');

    // 14. 最终查看完整聊天记录
    console.log('\n14. 查看完整聊天记录...');
    const finalHistory = await request({
      hostname: 'localhost', port: 3000, path: '/ai/cs/chats/' + customerId,
      method: 'GET', headers: {'Authorization': 'Bearer ' + csToken}
    });
    console.log('   总消息数:', finalHistory.body.length);
    finalHistory.body.forEach((msg, i) => {
      const dir = msg.direction === 'INBOUND' ? '客户' : '客服';
      const content = msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content;
      console.log('   ' + (i+1) + '. [' + dir + '] ' + content);
    });
  }

  console.log('\n=== 测试完成 ===');
}

testFlow().catch(console.error);
