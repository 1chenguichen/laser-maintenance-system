const https = require('https');

const DIFY_API_KEY = 'app-vDGe9PBzWhaUim4CLe75qDYy';

const body = JSON.stringify({
  query: '设备不开机怎么办？',
  user: 'test-user',
  inputs: {},
  response_mode: 'streaming',
  conversation_id: ''
});

const options = {
  hostname: 'api.dify.ai',
  port: 443,
  path: '/v1/chat-messages',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + DIFY_API_KEY,
    'Content-Length': Buffer.byteLength(body)
  }
};

console.log('测试 Dify 流式响应...\n');

const req = https.request(options, (res) => {
  console.log('状态码:', res.statusCode);
  console.log('headers:', JSON.stringify(res.headers));

  let count = 0;
  res.on('data', (chunk) => {
    count++;
    console.log(`\n--- chunk ${count} ---`);
    console.log(chunk.toString().substring(0, 500));
  });

  res.on('end', () => {
    console.log('\n\n流结束，总共收到', count, '个chunk');
  });
});

req.on('error', (e) => {
  console.error('请求错误:', e.message);
});

req.write(body);
req.end();
