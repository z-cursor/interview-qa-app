import React, { useCallback, useState } from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';

// ── Types ──

interface ScrollProgressBarProps {
  /** 内容总高度 (px) */
  contentHeight: number;
  /** 可视区域高度 (px) */
  viewportHeight: number;
  /** 当前滚动偏移 (px) */
  scrollOffset: number;
  /** 用户拖动滚动条 → 按比例滚动 */
  onScrollTo: (ratio: number) => void;
  /** 主题强调色 */
  accentColor: string;
}

// ── 常量 ──

/** 可视轨道宽度 */
const BAR_WIDTH = 3;
/** 触摸热区宽度（含两侧 padding） */
const TOUCH_WIDTH = 20;

// ── Component ──

/**
 * 滚动进度条 — 纯位置指示器 + 拖拽跳转。
 * 用 React.memo 避免父组件高频重渲染时重复 render。
 */
export default React.memo(function ScrollProgressBar({
  contentHeight,
  viewportHeight,
  scrollOffset,
  onScrollTo,
  accentColor,
}: ScrollProgressBarProps) {
  // 实测容器高度（应与 viewportHeight 一致，但有备无患）
  const [containerH, setContainerH] = useState(viewportHeight);
  const trackH = containerH || viewportHeight || 1;

  // ── 当前位置计算 ──

  const scrollableH = Math.max(1, contentHeight - viewportHeight);
  const scrollRatio = Math.max(0, Math.min(1, scrollOffset / scrollableH));

  // thumb 高度占比 = 可见区域 / 总内容
  const viewportRatio =
    contentHeight > 0 ? Math.min(1, viewportHeight / contentHeight) : 1;
  const thumbH = Math.max(8, viewportRatio * trackH);

  // thumb 在可滑动范围内的位置
  const thumbTravel = trackH - thumbH;
  const thumbTop = scrollRatio * thumbTravel;

  // ── 触摸处理 ──

  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const { locationY } = e.nativeEvent;
      if (locationY === undefined) return;
      const ratio = Math.max(0, Math.min(1, locationY / trackH));
      onScrollTo(ratio);
    },
    [trackH, onScrollTo],
  );

  // ── Render ──

  const showThumb = contentHeight > viewportHeight;

  return (
    <View
      style={styles.touchArea}
      onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
    >
      {/* 可视轨道（居中） */}
      <View style={styles.track}>
        {/* 当前位置 thumb */}
        {showThumb && (
          <View
            style={[
              styles.thumb,
              {
                top: thumbTop,
                height: thumbH,
                backgroundColor: accentColor,
              },
            ]}
          />
        )}
      </View>
    </View>
  );
});

// ── Styles ──

const styles = StyleSheet.create({
  touchArea: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: TOUCH_WIDTH,
    zIndex: 10,
    alignItems: 'center',
  },
  track: {
    width: BAR_WIDTH,
    flex: 1,
    marginVertical: 8,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: 'transparent',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: BAR_WIDTH / 2,
    opacity: 0.7,
  },
});
