import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { login, sendCode } from '../api';

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!phone || phone.length !== 11) {
      Alert.alert('请输入正确的手机号');
      return;
    }
    try {
      await sendCode(phone);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(timer); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (e: any) {
      Alert.alert('发送失败', e.message);
    }
  };

  const handleLogin = async () => {
    if (!phone || !code) {
      Alert.alert('请填写手机号和验证码');
      return;
    }
    setLoading(true);
    try {
      const data = await login(phone, code);
      // 登录成功，跳转到首页
      navigation.replace('Home');
    } catch (e: any) {
      Alert.alert('登录失败', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>工程师登录</Text>
      <Text style={styles.subtitle}>激光设备维修服务平台</Text>

      <View style={styles.form}>
        <Text style={styles.label}>手机号</Text>
        <TextInput
          style={styles.input}
          placeholder="请输入手机号"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={11}
        />

        <Text style={styles.label}>验证码</Text>
        <View style={styles.codeRow}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="请输入验证码"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            style={styles.codeButton}
            onPress={handleSendCode}
            disabled={countdown > 0}
          >
            <Text style={styles.codeButtonText}>
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.loginButton, loading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.loginButtonText}>
            {loading ? '登录中...' : '登录'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>测试模式：验证码 000000 可直接登录</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 30, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#1890ff' },
  subtitle: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 8, marginBottom: 40 },
  form: {},
  label: { fontSize: 14, color: '#333', marginBottom: 8, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 15, fontSize: 16, marginBottom: 20,
  },
  codeRow: { flexDirection: 'row', gap: 10 },
  codeInput: { flex: 1 },
  codeButton: {
    backgroundColor: '#e6f7ff', borderRadius: 8, paddingHorizontal: 15, justifyContent: 'center',
  },
  codeButtonText: { color: '#1890ff', fontSize: 14 },
  loginButton: {
    backgroundColor: '#1890ff', borderRadius: 8, padding: 15, alignItems: 'center', marginTop: 10,
  },
  loginButtonDisabled: { backgroundColor: '#ccc' },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  hint: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 20 },
});
