import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';

const TAGS = ['准时上门', '技术好', '态度好', '环境整洁', '讲解清晰'];

export default function ReviewScreen({ route, navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>维修已完成</Text>
        <Text style={styles.headerSubtitle}>请对张师傅的服务进行评价</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Text key={i} style={styles.star}>⭐</Text>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>服务标签（可多选）</Text>
        <View style={styles.tagGrid}>
          {TAGS.map((tag) => (
            <TouchableOpacity key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>评价内容（选填）</Text>
        <TextInput
          style={styles.textArea}
          placeholder="说说您对这次服务的感受..."
          multiline
          numberOfLines={4}
        />
      </View>

      <TouchableOpacity
        style={styles.submitButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.submitButtonText}>提交评价</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.complaintLink}>
        <Text style={styles.complaintText}>对服务不满意？点击投诉</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', padding: 30, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 14, color: '#666', marginTop: 10 },
  stars: { flexDirection: 'row', marginTop: 15 },
  star: { fontSize: 40, marginHorizontal: 5 },
  section: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold' },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  tag: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  tagText: { fontSize: 13 },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    height: 100,
    marginTop: 12,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#1890ff',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  complaintLink: { alignItems: 'center' },
  complaintText: { color: '#ff4d4f', fontSize: 13 },
});
