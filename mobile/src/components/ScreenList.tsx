/**
 * Inline list for content rendered inside a ScrollView.
 *
 * A FlatList nested in a ScrollView (scrollEnabled={false}) renders its rows
 * on native but nothing on react-native-web: the virtualized list derives its
 * render window from a bounded height, which a scrolling parent never gives
 * it, so the web build showed an empty content area under the tab bar. Every
 * list in this app is small and fully in memory, so a plain map with the same
 * separator produces identical output on every platform.
 */
import { Fragment } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { View } from 'react-native';

export default function ScreenList<T>({
  data,
  keyExtractor,
  renderItem,
  ItemSeparatorComponent,
  ListEmptyComponent,
}: {
  data: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Optional divider rendered between rows (not before the first). */
  ItemSeparatorComponent?: ComponentType;
  /** Rendered in place of the list when there is no data. */
  ListEmptyComponent?: ReactNode;
}) {
  if (data.length === 0 && ListEmptyComponent) {
    return <View>{ListEmptyComponent}</View>;
  }
  return (
    <View>
      {data.map((item, index) => (
        <Fragment key={keyExtractor(item)}>
          {index > 0 && ItemSeparatorComponent ? <ItemSeparatorComponent /> : null}
          {renderItem(item)}
        </Fragment>
      ))}
    </View>
  );
}
