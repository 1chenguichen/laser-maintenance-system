import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';

// 导入屏幕
import HomeScreen from '../screens/HomeScreen';
import OrderListScreen from '../screens/OrderListScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import DeviceScanScreen from '../screens/DeviceScanScreen';
import RepairFormScreen from '../screens/RepairFormScreen';
import PaymentScreen from '../screens/PaymentScreen';
import ReviewScreen from '../screens/ReviewScreen';
import RefundScreen from '../screens/RefundScreen';
import MessageScreen from '../screens/MessageScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AddressListScreen from '../screens/AddressListScreen';
import DeviceListScreen from '../screens/DeviceListScreen';

export type RootStackParamList = {
  Main: undefined;
  Home: undefined;
  DeviceScan: undefined;
  RepairForm: { deviceId: string; addressId: string };
  Payment: { orderId: string };
  OrderDetail: { orderId: string };
  Review: { orderId: string };
  Refund: { orderId: string };
  AddressList: undefined;
  DeviceList: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  OrderList: undefined;
  Message: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20 }}>{name}</Text>
      <Text style={{ fontSize: 10, color: focused ? '#1890ff' : '#999' }}>
        {name === '🏠' ? '首页' : name === '📋' ? '订单' : name === '💬' ? '消息' : '我的'}
      </Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="🏠" focused={focused} />,
          tabBarShowLabel: false,
        }}
      />
      <Tab.Screen
        name="OrderList"
        component={OrderListScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="📋" focused={focused} />,
          tabBarShowLabel: false,
        }}
      />
      <Tab.Screen
        name="Message"
        component={MessageScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="💬" focused={focused} />,
          tabBarShowLabel: false,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="👤" focused={focused} />,
          tabBarShowLabel: false,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1890ff' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: '设备报修' }}
        />
        <Stack.Screen
          name="DeviceScan"
          component={DeviceScanScreen}
          options={{ title: '识别设备' }}
        />
        <Stack.Screen
          name="RepairForm"
          component={RepairFormScreen}
          options={{ title: '填写报修单' }}
        />
        <Stack.Screen
          name="Payment"
          component={PaymentScreen}
          options={{ title: '订单待支付' }}
        />
        <Stack.Screen
          name="OrderDetail"
          component={OrderDetailScreen}
          options={{ title: '订单详情' }}
        />
        <Stack.Screen
          name="Review"
          component={ReviewScreen}
          options={{ title: '服务评价' }}
        />
        <Stack.Screen
          name="Refund"
          component={RefundScreen}
          options={{ title: '申请退款' }}
        />
        <Stack.Screen
          name="AddressList"
          component={AddressListScreen}
          options={{ title: '地址管理' }}
        />
        <Stack.Screen
          name="DeviceList"
          component={DeviceListScreen}
          options={{ title: '我的设备' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
