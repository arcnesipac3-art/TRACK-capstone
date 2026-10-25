/**
 * TRACK — simple dropdown selector.
 *
 * Replaces the missing react-native Picker with a modal-based dropdown
 * that works on iOS, Android, and web.
 */
import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography } from '../../theme';

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
          !selectedOption && styles.triggerPlaceholder,
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
          color={colors.navy700}
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
              <TouchableOpacity onPress={() => { setIsOpen(false); Keyboard.dismiss(); }}>
                <Ionicons name="close-outline" size={24} color={colors.navy700} />
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
            <FlatList
              data={filteredOptions}
              keyExtractor={item => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    value === item.value && styles.optionSelected,
                    itemStyle,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={[styles.optionText, value === item.value && styles.optionTextSelected]}>
                    {item.label}
                  </Text>
                  {value === item.value && (
                    <Ionicons name="checkmark-outline" size={20} color={colors.navy700} />
                  )}
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.optionsContainer}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.label },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },
  triggerOpen: {
    borderColor: colors.navy700,
    borderWidth: 2,
  },
  triggerPlaceholder: {
    // Placeholder styling handled by text color
  },
  triggerText: { ...typography.body, flex: 1, color: colors.text },
  placeholderText: { color: colors.textMuted },
  chevron: { marginLeft: spacing.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 48, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
    shadowColor: colors.navy900,
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
  modalTitle: { ...typography.heading, color: colors.navy900 },
  searchInput: {
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  optionsContainer: { paddingBottom: spacing.xl },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionSelected: { backgroundColor: colors.blue50 },
  optionText: { ...typography.body, color: colors.text, flex: 1 },
  optionTextSelected: { color: colors.navy700, fontWeight: '600' },
});