import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';

export default function Login() {
  const [phone, setPhone] = useState('13900000001');
  const [code, setCode] = useState('000000');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      setError('');
      await login(phone, code);
      navigate('/');
    } catch (e: any) {
      setError(e.message || '登录失败');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>客服管理后台</h1>
        <div className="form-group">
          <label>手机号</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="请输入手机号"
          />
        </div>
        <div className="form-group">
          <label>验证码</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="请输入验证码"
          />
        </div>
        {error && <div className="error-message">{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleLogin}>
          登录
        </button>
        <p className="hint">测试模式：验证码 000000 可直接登录</p>
      </div>
    </div>
  );
}
