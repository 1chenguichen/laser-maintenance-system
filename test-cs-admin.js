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

async function test() {
  console.log('=== 模拟客户-客服完整对话流程 ===\n');

  // 1. 客户登录
  const customerLogin = await request({
    hostname: 'localhost', port: 3000, path: '/auth/login',
    method: 'POST', headers: {'Content-Type': 'application/json'}
  }, JSON.stringify({phone:'13800138003', code:'000000', role:'customer'}));
  console.log('1. 客户登录:', customerLogin.body.user?.name || '失败');
  const customerToken = customerLogin.body.accessToken;

  // 2. 客户发送转人工
  console.log('\n2. 客户发送"转人工"...');
  const chat1 = await request({
    hostname: 'localhost', port: 3000, path: '/ai/chat',
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + customerToken}
  }, JSON.stringify({message:'转人工'}));
  console.log('   AI回复:', chat1.body.reply);
  console.log('   needHuman:', chat1.body.needHuman);

  // 3. 客服登录
  const csLogin = await request({
    hostname: 'localhost', port: 3000, path: '/auth/login',
    method: 'POST', headers: {'Content-Type': 'application/json'}
  }, JSON.stringify({phone:'13800138001', code:'000000', role:'cs_operator'}));
  console.log('\n3. 客服登录:', csLogin.body.user?.name || '失败');
  const csToken = csLogin.body.accessToken;
  const csOperatorId = csLogin.body.user.id;

  // 4. 客服查看等待客户
  const waiting = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/waiting',
    method: 'GET', headers: {'Authorization': 'Bearer ' + csToken}
  });
  console.log('\n4. 等待客户数:', waiting.body.length);
  const customerId = waiting.body[0]?.customerId;
  const customerName = waiting.body[0]?.customerName;
  console.log('   客户:', customerName);

  if (!customerId) {
    console.log('错误: 没有等待中的客户');
    return;
  }

  // 5. 客服接入
  const accept = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/accept',
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
  }, JSON.stringify({customerId, csOperatorId}));
  console.log('\n5. 客服接入客户:', accept.body.success ? '成功' : '失败');

  // 6. 获取历史记录（接入前只有转人工相关的2条）
  const history1 = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/chats/' + customerId,
    method: 'GET', headers: {'Authorization': 'Bearer ' + csToken}
  });
  console.log('\n6. 接入后查看历史 (应该有2条):', history1.body.length, '条');
  history1.body.forEach((m, i) => {
    const dir = m.direction === 'INBOUND' ? '客户' : 'AI客服';
    console.log('   ' + (i+1) + '. [' + dir + ']:', m.content.substring(0, 40));
  });

  // 7. 客服发送第一条消息
  const msg1 = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/send',
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
  }, JSON.stringify({customerId, message: '您好，我是人工客服，请问有什么可以帮助您？'}));
  console.log('\n7. 人工客服发送:', msg1.body.content.substring(0, 40));

  // 8. 客服再发一条
  const msg2 = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/send',
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + csToken}
  }, JSON.stringify({customerId, message: '您的设备是什么型号？出现什么问题了呢？'}));
  console.log('8. 人工客服发送:', msg2.body.content.substring(0, 40));

  // 9. 查看最新历史（应该有4条）
  const history2 = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/chats/' + customerId,
    method: 'GET', headers: {'Authorization': 'Bearer ' + csToken}
  });
  console.log('\n9. 查看最新历史 (应该有4条):', history2.body.length, '条');
  history2.body.forEach((m, i) => {
    const dir = m.direction === 'INBOUND' ? '👤客户' : '🎧客服/AI';
    console.log('   ' + (i+1) + '. ' + dir + ':', m.content.substring(0, 50));
  });

  // 10. 验证等待列表已清空
  const waiting2 = await request({
    hostname: 'localhost', port: 3000, path: '/ai/cs/waiting',
    method: 'GET', headers: {'Authorization': 'Bearer ' + csToken}
  });
  console.log('\n10. 等待列表验证:', waiting2.body.length === 0 ? '已清空 ✓' : '还有' + waiting2.body.length + '个');

  console.log('\n=== 测试完成 ===');
  console.log('\n前端验证要点:');
  console.log('1. 打开 http://localhost:8080/service-desk');
  console.log('2. 用客服账号登录 (13800138001 / 000000)');
  console.log('3. 应该能看到"待接入"列表中有客户但现在已被接入');
  console.log('4. 左侧"活跃会话"中应该显示客户名称');
  console.log('5. 点击客户名称应该显示右侧聊天窗口');
  console.log('6. 聊天窗口应该显示4条历史消息');
}

test().catch(console.error);
