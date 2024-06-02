import { Ref, computed, shallowRef, toValue } from 'vue';
import { AriaDescribableProps, AriaLabelableProps, InputBaseAttributes, InputEvents, Reactivify } from '../types';
import { uniqId, withRefCapture } from '../utils/common';
import { useFieldValue } from '../composables/useFieldValue';
import { useLabel } from '../composables/useLabel';
import { useSyncModel } from '../composables/useModelSync';

export interface SwitchDOMProps extends InputBaseAttributes, AriaLabelableProps, AriaDescribableProps, InputEvents {
  id: string;
  checked: boolean;
  name?: string;
  role?: string;
}

export type SwitchProps = {
  label?: string;
  name?: string;
  modelValue?: boolean;

  readonly?: boolean;
  disabled?: boolean;

  trueValue?: unknown;
  falseValue?: unknown;
};

export function useSwitch(props: Reactivify<SwitchProps>, elementRef?: Ref<HTMLInputElement>) {
  const id = uniqId();
  const inputRef = elementRef || shallowRef<HTMLInputElement>();
  const { labelProps, labelledByProps } = useLabel({
    for: id,
    label: props.label,
    targetRef: inputRef,
  });

  const { fieldValue } = useFieldValue<unknown>(toValue(props.modelValue) ?? toValue(props.falseValue) ?? false);

  /**
   * Normalizes in the incoming value to be either one of the given toggled values or a boolean.
   */
  function normalizeValue(nextValue: unknown) {
    if (typeof nextValue === 'boolean') {
      return nextValue ? toValue(props.trueValue) ?? true : toValue(props.falseValue) ?? false;
    }

    const trueValue = toValue(props.trueValue);
    if (nextValue === trueValue) {
      return trueValue;
    }

    const falseValue = toValue(props.falseValue);
    if (nextValue === falseValue) {
      return falseValue;
    }

    // Normalize the incoming value to a boolean
    return !!nextValue;
  }

  useSyncModel({
    model: fieldValue,
    onModelPropUpdated: value => {
      fieldValue.value = normalizeValue(value);
    },
  });

  function setValueFromEvent(e: Event) {
    fieldValue.value = normalizeValue((e.target as HTMLInputElement).checked);
  }

  const handlers: InputEvents = {
    onKeydown: (evt: KeyboardEvent) => {
      if (evt.code === 'Space' || evt.key === 'Enter') {
        evt.preventDefault();
        togglePressed();
      }
    },
    onChange: setValueFromEvent,
    onInput: setValueFromEvent,
  };

  function onClick() {
    togglePressed();
  }

  const isPressed = computed({
    get() {
      return fieldValue.value === (toValue(props.trueValue) ?? true);
    },
    set(value: boolean) {
      fieldValue.value = normalizeValue(value);
    },
  });

  /**
   * Use this if you are using a native input[type=checkbox] element.
   */
  const inputProps = computed<SwitchDOMProps>(() =>
    withRefCapture(
      {
        ...labelledByProps.value,
        id: id,
        name: toValue(props.name),
        disabled: toValue(props.disabled),
        readonly: toValue(props.readonly),
        checked: isPressed.value,
        role: 'switch',
        ...handlers,
      },
      inputRef,
      elementRef,
    ),
  );

  /**
   * Use this if you are using divs or buttons
   */
  const switchProps = computed(() => ({
    ...labelledByProps.value,
    role: 'switch',
    tabindex: '0',
    'aria-checked': isPressed.value ?? false,
    'aria-readonly': toValue(props.readonly) ?? undefined,
    'aria-disabled': toValue(props.disabled) ?? undefined,
    onKeydown: handlers.onKeydown,
    onClick,
  }));

  function togglePressed(force?: boolean) {
    isPressed.value = force ?? !isPressed.value;
  }

  return {
    fieldValue,
    isPressed,
    inputRef,
    labelProps,
    inputProps,
    switchProps,
    togglePressed,
  };
}
