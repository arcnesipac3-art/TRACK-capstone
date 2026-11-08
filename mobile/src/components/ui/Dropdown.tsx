/**
 * TRACK — simple dropdown selector.
 *
 * The app's only selector. Native `Picker` needs a pod/APK module, so it is the
 * one control that has to be a modal to behave the same on iOS, Android and web.
 *
 * The option list is a plain map inside a `ScrollView`, not a `FlatList`: a
 * virtualised list derives its render window from a bounded height, and this one
 * sits in a sheet that only ever declares `maxHeight`, so on web the rows exist in
 * the document, get measured, and are never hit-testable — the picker looked open
 * and refused to pick. An option set here is a handful of classes or departments,
 * so nothing is lost by rendering all of it.
 */
import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, scrim, spacing, touch, typography } from '../../theme';

export type DropdownOption<T> = {
  label: string;
  value: T;
};

type DropdownProps<T> = {
  label?: string;
  options: DropdownOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  style?: any;
  itemStyle?: any;
};

export default function Dropdown<T>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  style,
  itemStyle,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<any>(null);

  const selectedOption = options.find(o => o.value === value);
  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (option: DropdownOption<T>) => {
    onChange(option.value);
    setIsOpen(false);
    setSearch('');
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={[
          styles.trigger,
          isOpen && styles.triggerOpen,
        ]}
        onPress={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setSearch('');
          }
        }}
        accessibilityRole="combobox"
        aria-expanded={isOpen}
      >
        <Text style={[styles.triggerText, !selectedOption && styles.placeholderText]}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={20}
          color={colors.blue}
          style={styles.chevron}
        />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsOpen(false);
          setSearch('');
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => {
            setIsOpen(false);
            setSearch('');
            Keyboard.dismiss();
          }}
          activeOpacity={1}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label || 'Select'}</Text>
              <TouchableOpacity
                onPress={() => { setIsOpen(false); Keyboard.dismiss(); }}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={`Close ${label || 'selection'}`}
                hitSlop={8}
              >
                <Ionicons name="close-outline" size={24} color={colors.blue} />
              </TouchableOpacity>
            </View>
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search…"
              value={search}
              onChangeText={setSearch}
              autoFocus={true}
            />
            <ScrollView
              style={styles.options}
              contentContainerStyle={styles.optionsContainer}
              keyboardShouldPersistTaps="handled"
            >
              {filteredOptions.map((option) => (
                <TouchableOpacity
                  key={String(option.value)}
                  style={[
                    styles.option,
                    value === option.value && styles.optionSelected,
                    itemStyle,
                  ]}
                  onPress={() => handleSelect(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: value === option.value }}
                >
                  <Text style={[styles.optionText, value === option.value && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                  {value === option.value && (
                    <Ionicons name="checkmark-outline" size={20} color={colors.blue} />
                  )}
                </TouchableOpacity>
              ))}
              {filteredOptions.length === 0 ? (
                <Text style={styles.none}>Nothing here matches that.</Text>
              ) : null}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.label, color: colors.textMuted },
  /**
   * The same box <Field> draws, because a selector and an input sit next to each other
   * in every form and two heights of the same control read as two different controls.
   */
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    paddingHorizontal: spacing.lg,
    // The label is short enough that `control` is the height; the padding only keeps it
    // centred. Padding that grew the box past `control` is what made this trigger a pixel
    // taller than the input under it.
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: touch.control,
  },
  /** Focus tints the edge only — a thicker border moves the label by a pixel. */
  triggerOpen: { borderColor: colors.blue },
  triggerText: { ...typography.body, flex: 1, color: colors.text },
  placeholderText: { color: colors.textSubtle },
  chevron: { marginLeft: spacing.sm },
  /**
   * Absolute insets rather than `flex: 1`: the modal root is a block box, so a flex
   * child never gets a height to fill, the sheet flows to the bottom of the document
   * instead of the bottom of the screen, and its options sit out of the viewport.
   * This is the same box <Sheet> draws for the same reason.
   */
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: scrim,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.heading, color: colors.navy },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    backgroundColor: colors.quietFill,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  /** The sheet declares `maxHeight`, not a height, so the list has to be allowed to shrink. */
  options: { flexGrow: 0, minHeight: 0 },
  optionsContainer: { paddingBottom: spacing.xl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touch.target,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionSelected: { backgroundColor: colors.blueWash },
  optionText: { ...typography.body, color: colors.text, flex: 1 },
  optionTextSelected: { color: colors.blue, fontWeight: '700' },
  none: { ...typography.muted, color: colors.textSubtle, paddingVertical: spacing.md },
});