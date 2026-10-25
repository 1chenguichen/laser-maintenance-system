import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';

const mockMessages = [
  {
    id: '1',
    type: 'order_dispatched',
    title: '工单已派单',
    content: '工程师张师傅已接单，预计今天15:00上门',
    time: '10:30',
    isRead: false,
  },
  {
    id: '2',
    type: 'order_pending',
    title: '您的报修已提交',
    content: '客服正在处理中',
    time: '09:00',
    isRead: true,
  },
];

export default function MessageScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={mockMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.messageCard, !item.isRead && styles.unread]}>
            <View style={[styles.dot, !item.isRead && styles.dotActive]} />
            <View style={styles.messageContent}>
              <Text style={styles.messageTitle}>{item.title}</Text>
              <Text style={styles.messageText}>{item.content}</Text>
              <Text style={styles.messageTime}>{item.time}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无消息</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  messageCard: {
    backgroundColor: '#fff',
    padding: 15,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  unread: { backgroundColor: '#e6f7ff' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ddd', marginRight: 12, marginTop: 5 },
  dotActive: { backgroundColor: '#1890ff' },
  messageContent: { flex: 1 },
  messageTitle: { fontSize: 14, fontWeight: 'bold' },
  messageText: { fontSize: 13, color: '#666', marginTop: 5 },
  messageTime: { fontSize: 12, color: '#999', marginTop: 5 },
  empty: { textAlign: 'center', marginTop: 50, color: '#999' },
});
