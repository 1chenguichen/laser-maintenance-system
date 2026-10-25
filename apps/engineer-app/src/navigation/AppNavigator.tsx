import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import OrderListScreen from '../screens/OrderListScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { getToken } from '../api';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={{ fontSize: 10, color: focused ? '#1890ff' : '#999', marginTop: 2 }}>
        {icon === '🏠' ? '首页' : icon === '📋' ? '订单' : '我的'}
      </Text>
    </View>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ title: '工程师首页' }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: '订单详情' }} />
      <Stack.Screen name="Stats" component={StatsScreen} options={{ title: '收益统计' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: { height: 60, paddingBottom: 5 },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrderListScreen}
        options={{
          title: '我的订单',
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: '我的',
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 检查登录状态
    getToken().then((token) => {
      setIsLoggedIn(!!token);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>加载中...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isLoggedIn ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
