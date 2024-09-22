import { computed, InjectionKey, provide, toValue } from 'vue';
import { useFormField } from '../useFormField';
import { AriaLabelableProps, Arrayable, Orientation, Reactivify, TypedSchema } from '../types';
import {
  createAccessibleErrorMessageProps,
  createDescribedByProps,
  isEqual,
  normalizeArrayable,
  normalizeProps,
  toggleValueSelection,
  useUniqId,
} from '../utils/common';
import { useInputValidity } from '../validation';
import { useListBox } from './useListBox';
import { useLabel } from '../a11y/useLabel';
import { FieldTypePrefixes } from '../constants';
import { exposeField } from '../utils/exposers';

export interface SelectProps<TOption, TValue = TOption> {
  label: string;
  name?: string;
  description?: string;

  modelValue?: Arrayable<TValue>;

  disabled?: boolean;
  readonly?: boolean;
  multiple?: boolean;
  orientation?: Orientation;

  schema?: TypedSchema<Arrayable<TValue>>;
}

export interface SelectTriggerDomProps extends AriaLabelableProps {
  id: string;
  role: 'combobox';
  'aria-haspopup': 'listbox';
  'aria-expanded': boolean;
}

export interface SelectionContext<TOption, TValue = TOption> {
  isValueSelected(value: TValue): boolean;
  isMultiple(): boolean;
  isDisabled(): boolean;
  toggleValue(value: TValue, force?: boolean): void;
}

export const SelectionContextKey: InjectionKey<SelectionContext<unknown>> = Symbol('SelectionContextKey');

const MENU_OPEN_KEYS = ['Enter', 'Space', 'ArrowDown', 'ArrowUp'];

export function useSelect<TOption, TValue = TOption>(_props: Reactivify<SelectProps<TOption, TValue>, 'schema'>) {
  const inputId = useUniqId(FieldTypePrefixes.Select);
  const props = normalizeProps(_props, ['schema']);
  const isMutable = () => !toValue(props.disabled) && !toValue(props.readonly);
  const field = useFormField<Arrayable<TValue>>({
    path: props.name,
    initialValue: toValue(props.modelValue) as Arrayable<TValue>,
    disabled: props.disabled,

    schema: props.schema,
  });

  const { labelProps, labelledByProps } = useLabel({
    label: props.label,
    for: inputId,
  });

  let lastRecentlySelectedOption: TValue | undefined;
  const { listBoxProps, isOpen, options, isShiftPressed } = useListBox<TOption, TValue>({
    labeledBy: () => labelledByProps.value['aria-labelledby'],
    label: props.label,
    multiple: props.multiple,
    orientation: props.orientation,
    onToggleAll: toggleAll,
    onToggleBefore: toggleBefore,
    onToggleAfter: toggleAfter,
  });

  const { updateValidity } = useInputValidity({ field });
  const { fieldValue, setValue, errorMessage } = field;
  const { descriptionProps, describedByProps } = createDescribedByProps({
    inputId,
    description: props.description,
  });
  const { accessibleErrorProps, errorMessageProps } = createAccessibleErrorMessageProps({
    inputId,
    errorMessage,
  });

  function isSingle() {
    const isMultiple = toValue(props.multiple);

    return !isMultiple;
  }

  const selectionCtx: SelectionContext<TOption, TValue> = {
    isMultiple: () => toValue(props.multiple) ?? false,
    isValueSelected(value): boolean {
      const values = normalizeArrayable(fieldValue.value ?? []);

      return values.some(item => isEqual(item, value));
    },
    isDisabled: () => toValue(props.disabled) ?? false,
    toggleValue(optionValue, force) {
      if (!isMutable()) {
        return;
      }

      if (isSingle()) {
        lastRecentlySelectedOption = optionValue;
        setValue(optionValue);
        updateValidity();
        isOpen.value = false;
        return;
      }

      if (!isShiftPressed.value) {
        lastRecentlySelectedOption = optionValue;
        const nextValue = toggleValueSelection<TValue>(fieldValue.value ?? [], optionValue, force);
        setValue(nextValue);
        updateValidity();
        return;
      }

      // Handles contiguous selection when shift key is pressed, aka select all options between the two ranges.
      let lastRecentIdx = options.value.findIndex(opt => isEqual(opt.getValue(), lastRecentlySelectedOption));
      const targetIdx = options.value.findIndex(opt => isEqual(opt.getValue(), optionValue));
      if (targetIdx === -1) {
        return;
      }

      lastRecentIdx = lastRecentIdx === -1 ? 0 : lastRecentIdx;
      const startIdx = Math.min(lastRecentIdx, targetIdx);
      const endIdx = Math.min(Math.max(lastRecentIdx, targetIdx), options.value.length - 1);
      selectRange(startIdx, endIdx);
    },
  };

  function selectRange(start: number, end: number) {
    const nextValue = options.value.slice(start, end + 1).map(opt => opt.getValue());
    setValue(nextValue);
    updateValidity();
  }

  function toggleBefore() {
    if (isSingle() || !isMutable()) {
      return;
    }

    const focusedIdx = options.value.findIndex(opt => opt.isFocused());
    if (focusedIdx < 0) {
      return;
    }

    const startIdx = 0;
    const endIdx = Math.min(focusedIdx, options.value.length - 1);
    selectRange(startIdx, endIdx);
  }

  function toggleAfter() {
    if (isSingle() || !isMutable()) {
      return;
    }

    const focusedIdx = options.value.findIndex(opt => opt.isFocused());
    const startIdx = Math.max(0, focusedIdx);
    const endIdx = options.value.length - 1;
    selectRange(startIdx, endIdx);
  }

  function toggleAll() {
    if (isSingle() || !isMutable()) {
      return;
    }

    const isAllSelected = options.value.every(opt => opt.isSelected());
    if (isAllSelected) {
      setValue([]);
      updateValidity();
      return;
    }

    setValue(options.value.map(opt => opt.getValue()));
    updateValidity();
  }

  provide(SelectionContextKey, selectionCtx);

  const handlers = {
    onClick() {
      isOpen.value = !isOpen.value;
    },
    onKeydown(e: KeyboardEvent) {
      if (!isOpen.value && MENU_OPEN_KEYS.includes(e.code)) {
        e.preventDefault();
        isOpen.value = true;
        return;
      }
    },
  };

  const triggerProps = computed<SelectTriggerDomProps>(() => {
    return {
      ...labelledByProps.value,
      ...describedByProps.value,
      ...accessibleErrorProps.value,
      id: inputId,
      tabindex: '0',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': isOpen.value,
      ...handlers,
    };
  });

  return {
    isOpen,
    triggerProps,
    labelProps,
    popupProps: listBoxProps,
    errorMessageProps,
    descriptionProps,
    ...exposeField(field),
  };
}
