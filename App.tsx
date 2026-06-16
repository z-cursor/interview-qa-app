import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useStore } from './src/store/useStore';
import { preloadPresetDecks } from './src/lib/preload';
import { ThemeProvider, useTheme, ColorTokens } from './src/lib/ThemeContext';
import { FontSize } from './src/lib/theme';
import HomeScreen from './src/screens/HomeScreen';
import StudyScreen from './src/screens/StudyScreen';
import ViewerScreen from './src/screens/ViewerScreen';
import FileListScreen from './src/screens/FileListScreen';
import MDEditorScreen from './src/screens/MDEditorScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** 文件 Tab Stack */
function FileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FileList" component={FileListScreen as React.FC<any>} />
      <Stack.Screen name="MDEditor" component={MDEditorScreen as React.FC<any>} />
    </Stack.Navigator>
  );
}

/** 题库 Tab Stack */
function DeckStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen as React.FC<any>} />
      <Stack.Screen name="Study" component={StudyScreen as React.FC<any>} />
      <Stack.Screen name="Viewer" component={ViewerScreen as React.FC<any>} />
      <Stack.Screen name="MDEditor" component={MDEditorScreen as React.FC<any>} />
    </Stack.Navigator>
  );
}

/** 内层 App：使用 useTheme hook（必须在 ThemeProvider 内部） */
function AppInner() {
  const { colors, isDark } = useTheme();

  const navTheme = useMemo(() => ({
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.bgCard,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.accent,
    },
  }), [colors, isDark]);

  const splashStyles = useMemo(() => createSplashStyles(colors), [colors]);

  const { isPreloading, setPreloading, setPreloadDone, loadDecks, loadFiles } = useStore();
  const [preloadError, setPreloadError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        setPreloading(true);
        const count = await preloadPresetDecks();
        console.log(`[App] 预加载完成: ${count} 个题库`);
        loadDecks();
        loadFiles();
        setPreloadDone();
      } catch (err: any) {
        console.error('[App] 预加载失败:', err);
        setPreloadError(err?.message || '加载失败');
        setPreloading(false);
      }
    }
    init();
  }, []);

  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  // 加载中
  if (isPreloading) {
    return (
      <View style={splashStyles.splash}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={colors.bg} />
        <Text style={splashStyles.splashEmoji}>🎯</Text>
        <Text style={splashStyles.splashTitle}>面试题库</Text>
        <Text style={splashStyles.splashSubtitle}>正在准备题库…</Text>
        <ActivityIndicator
          size="small"
          color={colors.accent}
          style={splashStyles.splashSpinner}
        />
      </View>
    );
  }

  // 加载失败
  if (preloadError) {
    return (
      <View style={splashStyles.splash}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <Text style={splashStyles.splashEmoji}>⚠️</Text>
        <Text style={splashStyles.splashTitle}>加载失败</Text>
        <Text style={splashStyles.splashSubtitle}>{preloadError}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.bg} />
      <View style={{ flex: 1 }}>
        <NavigationContainer theme={navTheme}>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarStyle: {
                backgroundColor: colors.bgCard,
                borderTopColor: colors.border,
                borderTopWidth: 1,
                paddingTop: 4,
                height: 60,
              },
              tabBarActiveTintColor: colors.accent,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarLabelStyle: {
                fontSize: 11,
                fontWeight: '600' as const,
              },
              tabBarIcon: ({ color, size }) => {
                let iconName: keyof typeof Ionicons.glyphMap = 'help-circle';
                if (route.name === '文件') iconName = 'document-text';
                else if (route.name === '题库') iconName = 'library';
                return <Ionicons name={iconName} size={size} color={color} />;
              },
            })}
          >
            <Tab.Screen name="文件" component={FileStack} />
            <Tab.Screen name="题库" component={DeckStack} />
          </Tab.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

function createSplashStyles(c: ColorTokens) {
  return StyleSheet.create({
    splash: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    splashEmoji: {
      fontSize: 64,
      marginBottom: 20,
    },
    splashTitle: {
      color: c.textPrimary,
      fontSize: FontSize.title,
      fontWeight: '700',
      marginBottom: 8,
    },
    splashSubtitle: {
      color: c.textMuted,
      fontSize: FontSize.md,
    },
    splashSpinner: {
      marginTop: 24,
    },
  });
}

/** 主 App — 包裹 ThemeProvider */
export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
