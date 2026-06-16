import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useTheme, ColorTokens } from '../lib/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../lib/theme';
import { getTotalStats } from '../lib/database';
import DeckCard from '../components/DeckCard';
import EmptyState from '../components/EmptyState';

interface HomeScreenProps {
  navigation: any;
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { decks, loadDecks } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ totalQuestions: 0, totalCompleted: 0, totalDecks: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [statsExpanded, setStatsExpanded] = useState(true);

  useEffect(() => {
    loadDecks();
    setStats(getTotalStats());
  }, [loadDecks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDecks();
    setStats(getTotalStats());
    setRefreshing(false);
  }, [loadDecks]);

  const handleDeckPress = useCallback((deckId: string) => {
    navigation.navigate('Study', { deckId, mode: 'sequential' });
  }, [navigation]);

  const handleDeckLongPress = useCallback((deckId: string) => {
    const deck = decks.find(d => d.id === deckId);
    if (deck?.fileId) {
      navigation.navigate('MDEditor', { fileId: deck.fileId });
    } else {
      navigation.navigate('Viewer', { deckId });
    }
  }, [navigation, decks]);

  // 搜索过滤
  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return decks;
    const q = searchQuery.toLowerCase();
    return decks.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.fileName.toLowerCase().includes(q)
    );
  }, [decks, searchQuery]);

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.greeting}>面试题库</Text>
      <Text style={styles.subtitle}>语音练习 · 随时刷题</Text>

      {/* 搜索框 */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索题库…"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={16}
            color={colors.textMuted}
            onPress={() => setSearchQuery('')}
          />
        )}
      </View>

      {/* 可折叠统计卡片 */}
      <PressableHeader
        title="统计"
        expanded={statsExpanded}
        onToggle={() => setStatsExpanded(!statsExpanded)}
        colors={colors}
      />
      {statsExpanded && (
        <View style={styles.statsRow}>
          <StatItem icon="documents" value={stats.totalDecks.toString()} label="题库" colors={colors} />
          <StatItem icon="help-circle" value={stats.totalQuestions.toString()} label="题目" colors={colors} />
          <StatItem icon="checkmark-circle" value={stats.totalCompleted.toString()} label="已刷" colors={colors} />
        </View>
      )}
    </View>
  );

  if (decks.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader()}
        <EmptyState
          icon="library-outline"
          title="还没有题库"
          subtitle="请在「文件」Tab 中长按文件 → 导入到题库"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={filteredDecks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DeckCard
            deck={item}
            onPress={() => handleDeckPress(item.id)}
            onLongPress={() => handleDeckLongPress(item.id)}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="没有匹配的题库"
            subtitle={`没有找到包含 "${searchQuery}" 的题库`}
          />
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      />
    </View>
  );
}

/** 可折叠 header */
function PressableHeader({
  title, expanded, onToggle, colors,
}: { title: string; expanded: boolean; onToggle: () => void; colors: ColorTokens }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm }}
      onTouchEnd={onToggle}>
      <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', flex: 1 }}>
        {title}
      </Text>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={colors.textMuted}
      />
    </View>
  );
}

function StatItem({ icon, value, label, colors }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  colors: ColorTokens;
}) {
  return (
    <View style={[statStyles(colors).statItem]}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={statStyles(colors).statValue}>{value}</Text>
      <Text style={statStyles(colors).statLabel}>{label}</Text>
    </View>
  );
}

function statStyles(c: ColorTokens) {
  return StyleSheet.create({
    statItem: {
      flex: 1,
      backgroundColor: c.bgCard,
      borderRadius: 12,
      padding: Spacing.lg,
      alignItems: 'center',
    },
    statValue: {
      color: c.textPrimary,
      fontSize: FontSize.xxl,
      fontWeight: '700',
      marginTop: Spacing.sm,
    },
    statLabel: {
      color: c.textMuted,
      fontSize: FontSize.xs,
      marginTop: Spacing.xs,
    },
  });
}

function createStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    header: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.md,
    },
    greeting: {
      color: c.textPrimary,
      fontSize: FontSize.title,
      fontWeight: '700',
    },
    subtitle: {
      color: c.textMuted,
      fontSize: FontSize.md,
      marginTop: Spacing.xs,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgInput,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.md,
      marginTop: Spacing.lg,
      height: 40,
      gap: Spacing.sm,
    },
    searchInput: {
      flex: 1,
      color: c.textPrimary,
      fontSize: FontSize.sm,
      paddingVertical: 0,
    },
    statsRow: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    listContent: {
      paddingBottom: Spacing.huge,
    },
  });
}
